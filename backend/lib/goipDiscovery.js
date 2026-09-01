const os = require('os');
const axios = require('axios');
const net = require('net');

class GoipDiscovery {
  constructor() {
    this.isScanning = false;
    this.lastDiscoveredIp = null;
  }

  getLocalSubnets() {
    const interfaces = os.networkInterfaces();
    const subnets = new Set();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          if (parts.length === 4 && parts[0] === '192' && parts[1] === '168') {
            subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
          }
        }
      }
    }

    // Always include standard GoIP subnets
    subnets.add('192.168.8');
    subnets.add('192.168.1');

    return Array.from(subnets);
  }

  checkPort(ip, port = 80, timeout = 500) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, ip);
    });
  }

  async verifyGoipSignature(ip) {
    try {
      // Test standard DBL GoIP endpoints
      const endpoints = [
        `http://${ip}/default/en_US/status.html`,
        `http://${ip}/default/en_US/send.html`,
        `http://${ip}/default/en_US/tools.html`,
        `http://${ip}/`
      ];

      for (const url of endpoints) {
        try {
          const res = await axios.get(url, {
            timeout: 1200,
            validateStatus: () => true, // Don't throw on 401 or other codes
            headers: {
              'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64')
            }
          });

          const dataStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          const headersStr = JSON.stringify(res.headers);

          // Check signatures for DBL GoIP-1
          if (
            dataStr.includes('GoIP') ||
            dataStr.includes('goip') ||
            dataStr.includes('DBL') ||
            dataStr.includes('send.html') ||
            dataStr.includes('status.html') ||
            dataStr.includes('VoIP GSM Gateway') ||
            dataStr.includes('GSM Gateway') ||
            headersStr.includes('GoIP') ||
            (res.status === 401 && (headersStr.includes('Basic realm="GoIP"') || headersStr.includes('realm="voip"')))
          ) {
            return {
              found: true,
              ip,
              status: res.status,
              signature: 'DBL GoIP GSM Gateway'
            };
          }
        } catch (e) {
          // ignore single endpoint error
        }
      }
    } catch (err) {
      // ignore
    }
    return { found: false };
  }

  async discover() {
    if (this.isScanning) return { scanning: true };
    this.isScanning = true;

    try {
      const subnets = this.getLocalSubnets();
      const candidates = [];

      // Generate all IPs in subnets
      for (const subnet of subnets) {
        for (let i = 1; i <= 254; i++) {
          candidates.push(`${subnet}.${i}`);
        }
      }

      console.log(`[Auto-Discovery] Scanning ${candidates.length} IPs across subnets: ${subnets.join(', ')}...`);

      // Batch port check (50 concurrent checks at a time)
      const openPortIps = [];
      const batchSize = 50;

      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (ip) => {
            const isOpen = await this.checkPort(ip, 80, 400);
            return isOpen ? ip : null;
          })
        );
        openPortIps.push(...results.filter(Boolean));
      }

      console.log(`[Auto-Discovery] Port 80 open on ${openPortIps.length} devices:`, openPortIps);

      // Verify signatures for devices with port 80 open
      for (const ip of openPortIps) {
        const check = await this.verifyGoipSignature(ip);
        if (check.found) {
          console.log(`[Auto-Discovery] ✅ FOUND DBL GoIP-1 Hardware at: ${ip}`);
          this.lastDiscoveredIp = ip;
          this.isScanning = false;
          return {
            success: true,
            ip,
            signature: check.signature
          };
        }
      }

      this.isScanning = false;
      return {
        success: false,
        openIps: openPortIps,
        message: 'No GoIP-1 signature found on active network. Ensure GoIP LAN cable is connected and powered on.'
      };
    } catch (err) {
      this.isScanning = false;
      return { success: false, error: err.message };
    }
  }
}

module.exports = new GoipDiscovery();
