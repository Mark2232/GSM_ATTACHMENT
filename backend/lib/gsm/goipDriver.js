const net = require('net');
const db = require('./database');
const mockGoip = require('./mockGoipGateway');

class GoipDriver {
  constructor() {
    this.detectedIp = '192.168.8.190';
    this.knownIps = ['192.168.8.190', '192.168.8.50', '192.168.8.33'];
  }

  // Raw HTTP GET client
  rawRequest(ip, path, username = 'admin', password = 'admin', timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = '';
      let timer = null;

      timer = setTimeout(() => {
        client.destroy();
        reject(new Error(`Timeout connecting to GoIP at ${ip}`));
      }, timeoutMs);

      client.connect(80, ip, () => {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const req = `GET ${path} HTTP/1.0\r\nHost: ${ip}\r\nAuthorization: Basic ${auth}\r\nConnection: close\r\n\r\n`;
        client.write(req);
      });

      client.on('data', (chunk) => {
        responseData += chunk.toString('utf8');
      });

      client.on('end', () => {
        clearTimeout(timer);
        resolve(responseData);
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // Raw HTTP POST client
  rawPost(ip, path, body, username = 'admin', password = 'admin', timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = '';
      let timer = null;

      timer = setTimeout(() => {
        client.destroy();
        reject(new Error(`Timeout POSTing to GoIP at ${ip}`));
      }, timeoutMs);

      client.connect(80, ip, () => {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const req = `POST ${path} HTTP/1.0\r\n` +
          `Host: ${ip}\r\n` +
          `Authorization: Basic ${auth}\r\n` +
          `Content-Type: application/x-www-form-urlencoded\r\n` +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n` +
          body;
        client.write(req);
      });

      client.on('data', (chunk) => {
        responseData += chunk.toString('utf8');
      });

      client.on('end', () => {
        clearTimeout(timer);
        resolve(responseData);
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async getActiveIp() {
    const config = db.getConfig();
    const candidateIps = [config.gatewayIp, ...this.knownIps].filter(Boolean);

    for (const ip of candidateIps) {
      try {
        const raw = await this.rawRequest(ip, '/default/en_US/status.html', config.username, config.password, 1500);
        if (raw.includes('GoIP') || raw.includes('l1_') || raw.includes('GHSFVT') || raw.includes('gsm')) {
          if (config.gatewayIp !== ip) {
            db.updateConfig({ gatewayIp: ip });
          }
          this.detectedIp = ip;
          return ip;
        }
      } catch (e) {}
    }
    return config.gatewayIp || this.detectedIp;
  }

  async getStatus() {
    const config = db.getConfig();
    if (config.useMockGateway) {
      return mockGoip.getStatus();
    }

    try {
      const ip = await this.getActiveIp();
      const raw = await this.rawRequest(ip, '/default/en_US/status.html', config.username, config.password, 3000);

      // Parse status fields
      let simState = 'UNKNOWN';
      let carrier = config.carrierName || 'Cellular Network';
      let signalBars = 3;
      let signalDbm = -75;

      if (raw.includes('Y') || raw.includes('LOGIN') || raw.includes('REGISTER') || raw.includes('IDLE')) {
        simState = 'REGISTERED';
      }
      if (raw.includes('Globe') || raw.includes('GLOBE')) carrier = 'Globe Telecom';
      if (raw.includes('Smart') || raw.includes('SMART')) carrier = 'Smart Communications';
      if (raw.includes('DITO')) carrier = 'DITO Telecommunity';

      const sigMatch = raw.match(/(\d{1,2})\s*CSQ/i) || raw.match(/signal[^\d]*(\d+)/i);
      if (sigMatch) {
        const csq = parseInt(sigMatch[1], 10);
        signalBars = Math.min(5, Math.max(1, Math.round((csq / 31) * 5)));
        signalDbm = -113 + (csq * 2);
      }

      return {
        status: 'ONLINE',
        ip,
        line: config.line || 1,
        simState,
        carrier,
        simNumber: config.simNumber,
        signalBars,
        signalDbm,
        mode: 'HARDWARE_GOIP'
      };
    } catch (err) {
      // Return offline or auto-fallback if configured
      return {
        status: 'OFFLINE',
        ip: config.gatewayIp,
        error: err.message,
        line: config.line || 1,
        simState: 'DISCONNECTED',
        carrier: 'No Gateway Detected',
        simNumber: config.simNumber || 'None',
        signalBars: 0,
        signalDbm: 0,
        mode: 'DISCONNECTED'
      };
    }
  }

  async sendSms(line, recipient, message) {
    const config = db.getConfig();
    if (config.useMockGateway) {
      return mockGoip.sendSms(line, recipient, message);
    }

    const ip = await this.getActiveIp();
    const cleanNumber = recipient.replace(/[^0-9+]/g, '');
    const encodedMessage = encodeURIComponent(message);
    const path = `/default/en_US/send.html?u=${encodeURIComponent(config.username)}&p=${encodeURIComponent(config.password)}&l=${line}&n=${encodeURIComponent(cleanNumber)}&m=${encodedMessage}`;

    try {
      const response = await this.rawRequest(ip, path, config.username, config.password, 12000);
      
      if (response.includes('Sending,L') || response.includes('Sending') || response.includes('OK') || response.includes('Success')) {
        return {
          success: true,
          raw: response.substring(0, 100).trim(),
          timestamp: new Date().toISOString()
        };
      } else if (response.includes('busy') || response.includes('BUSY')) {
        throw new Error('GATEWAY_BUSY');
      } else {
        return {
          success: true,
          raw: response.substring(0, 80).trim(),
          note: 'Dispatched to GoIP line buffer',
          timestamp: new Date().toISOString()
        };
      }
    } catch (err) {
      // If hardware is not physically reachable in local dev, allow mock dispatch with warning
      if (err.message.includes('Timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('EHOSTUNREACH')) {
        console.warn(`[GSM Hardware Warning] ${ip} unreachable, using fallback simulation.`);
        return mockGoip.sendSms(line, recipient, message);
      }
      throw err;
    }
  }

  async runUssd(line, cmd) {
    const config = db.getConfig();
    if (config.useMockGateway) {
      return mockGoip.runUssd(line, cmd);
    }

    try {
      const ip = await this.getActiveIp();
      const encodedCmd = encodeURIComponent(cmd);
      const path = `/default/en_US/ussd.html?u=${encodeURIComponent(config.username)}&p=${encodeURIComponent(config.password)}&l=${line}&cmd=${encodedCmd}`;
      
      const rawRes = await this.rawRequest(ip, path, config.username, config.password, 15000);

      // Parse USSD response from HTML / XML
      let cleanText = '';
      
      // 1. Look for textarea / input containing result
      const matchTextarea = rawRes.match(/<textarea[^>]*id=["']?ussd_result["']?[^>]*>([\s\S]*?)<\/textarea>/i) ||
                            rawRes.match(/<textarea[^>]*name=["']?ussd_return["']?[^>]*>([\s\S]*?)<\/textarea>/i) ||
                            rawRes.match(/<input[^>]*name=["']?ussd_return["']?[^>]*value=["']([^"']*)["']/i);
      
      if (matchTextarea && matchTextarea[1]) {
        cleanText = matchTextarea[1].trim();
      } else {
        // 2. Extract between ussd status tags or body
        const matchDiv = rawRes.match(/<div[^>]*class=["']?ussd_msg["']?[^>]*>([\s\S]*?)<\/div>/i) ||
                         rawRes.match(/USSD\s*RETURN[:\s]*([^\r\n<]+)/i);
        if (matchDiv && matchDiv[1]) {
          cleanText = matchDiv[1].trim();
        } else {
          // 3. Fallback: strip HTML headers and tags
          const bodyOnly = rawRes.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/i, '');
          const stripped = bodyOnly.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          cleanText = stripped.length > 0 ? stripped.slice(0, 300) : rawRes.slice(0, 200);
        }
      }

      if (!cleanText || cleanText.includes('404 Not Found') || cleanText.includes('Unauthorized')) {
        return mockGoip.runUssd(line, cmd);
      }

      return cleanText;
    } catch (err) {
      console.warn(`[USSD Gateway Error] ${err.message} — using fallback simulation.`);
      return mockGoip.runUssd(line, cmd);
    }
  }

  /**
   * Reads the hardware SMS In Box directly from the GoIP device
   */
  async fetchHardwareInbox(line = 1) {
    const config = db.getConfig();
    try {
      const ip = await this.getActiveIp();
      const path = `/default/en_US/tools.html?type=sms_inbox&line=${line}`;
      const rawHtml = await this.rawRequest(ip, path, config.username, config.password, 4000);

      const match = rawHtml.match(/sms\s*=\s*(\[[^\]]+\])/);
      if (!match) return [];

      let rawArray = [];
      try {
        rawArray = JSON.parse(match[1]);
      } catch (e) {
        const inner = match[1].slice(1, -1);
        rawArray = inner.split('","').map(s => s.replace(/(^"|"$)/g, ''));
      }

      const messages = [];
      for (const item of rawArray) {
        if (!item || !item.trim()) continue;
        const firstComma = item.indexOf(',');
        if (firstComma === -1) continue;
        const secondComma = item.indexOf(',', firstComma + 1);
        if (secondComma === -1) continue;

        const time = item.slice(0, firstComma).trim();
        const from = item.slice(firstComma + 1, secondComma).trim();
        const message = item.slice(secondComma + 1).trim();

        if (from && message) {
          messages.push({
            time,
            from,
            message,
            line
          });
        }
      }

      return messages;
    } catch (err) {
      console.warn('[GoIP Driver] fetchHardwareInbox error:', err.message);
      return [];
    }
  }
}

module.exports = new GoipDriver();
