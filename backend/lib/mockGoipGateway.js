/**
 * Mock DBL GoIP-1 Gateway Simulator
 * Simulates DBL GoIP-1 hardware responses, USSD balance queries, line states, and RSSI signal.
 */
class MockGoipGateway {
  constructor() {
    this.lineBusy = false;
    this.signalDbm = -68;
    this.signalBars = 4;
    this.carrier = 'Globe Telecom PH';
    this.simStatus = 'ACTIVE';
    this.simBalance = '₱145.50 (GoUNLI350 Active, Exp: 7 Days)';
    this.totalDispatched = 0;
  }

  async sendSms(phone, message, line = 1) {
    if (this.lineBusy) {
      return {
        success: false,
        code: 'GATEWAY_BUSY',
        rawResponse: 'busy',
        message: 'GoIP Line 1 is currently busy transmitting.'
      };
    }

    // Mark line busy for dispatch simulation
    this.lineBusy = true;
    
    // Simulate GSM network transmission latency (1.5 - 2.5s)
    await new Promise(res => setTimeout(res, 1800));

    this.lineBusy = false;

    // 95% success rate simulation
    const isSuccess = Math.random() > 0.05;

    if (isSuccess) {
      this.totalDispatched++;
      return {
        success: true,
        code: 'SEND_ACCEPTED',
        rawResponse: `Sending,L${line}`,
        gsmTxId: `GSM_TX_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        message: `Successfully accepted by DBL GoIP-1 Line ${line}`
      };
    } else {
      return {
        success: false,
        code: 'GATEWAY_ERROR',
        rawResponse: 'ERROR: GSM line handshake timeout',
        message: 'GoIP line error during GSM tower transmission'
      };
    }
  }

  async runUssd(command, line = 1) {
    await new Promise(res => setTimeout(res, 1200));

    const cmd = command.trim();
    if (cmd === '*143#' || cmd === '*123#') {
      return {
        success: true,
        command: cmd,
        response: `[Globe USSD Reply]\nAccount Load: ${this.simBalance}\nFree Texts: 842 remaining\nData: 4.2 GB remaining\nRef ID: USD-${Math.floor(Math.random() * 899999 + 100000)}`
      };
    } else if (cmd.includes('1515') || cmd.toLowerCase().includes('balance')) {
      return {
        success: true,
        command: cmd,
        response: `[Carrier Info]\nYour remaining load balance is P145.50 valid until 2026-09-30. Active Promo: GoUNLI350.`
      };
    } else {
      return {
        success: true,
        command: cmd,
        response: `[USSD Executed]\nResponse for ${cmd}: Service OK. Command executed successfully on GoIP Line ${line}.`
      };
    }
  }

  getHardwareStatus() {
    // Slight signal variation for realism
    const jitter = Math.floor(Math.random() * 5) - 2;
    const rssi = Math.min(-55, Math.max(-95, this.signalDbm + jitter));
    
    let bars = 5;
    if (rssi < -85) bars = 2;
    else if (rssi < -75) bars = 3;
    else if (rssi < -65) bars = 4;

    return {
      hardwareModel: 'DBL GoIP-1 (Simulated)',
      firmwareVersion: 'GS-4.01-64',
      lanIp: '192.168.1.150',
      status: 'ONLINE',
      lineState: this.lineBusy ? 'BUSY_TRANSMITTING' : 'IDLE_READY',
      simState: 'INSERTED_READY',
      carrier: this.carrier,
      rssiDbm: rssi,
      signalBars: bars,
      gsmRegistration: 'REGISTERED_HOME_NETWORK',
      totalDispatched: this.totalDispatched
    };
  }
}

module.exports = new MockGoipGateway();
