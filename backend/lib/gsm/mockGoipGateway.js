// Mock DBL GoIP-1 Hardware Simulator
class MockGoipGateway {
  constructor() {
    this.simState = 'REGISTERED';
    this.signalDbm = -65;
    this.carrier = 'Globe Telecom (Mock Sim)';
    this.simNumber = '0917-307-9499';
    this.balance = 524.50;
  }

  getStatus() {
    return {
      status: 'ONLINE',
      ip: '127.0.0.1 (Mock)',
      line: 1,
      simState: this.simState,
      carrier: this.carrier,
      simNumber: this.simNumber,
      signalBars: 4,
      signalDbm: this.signalDbm,
      mode: 'MOCK_SIMULATOR',
      uptime: '14d 06h 22m'
    };
  }

  async sendSms(line, number, message) {
    await new Promise(r => setTimeout(r, 600));
    return {
      success: true,
      raw: `Sending,L${line}`,
      simulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async runUssd(line, cmd) {
    await new Promise(r => setTimeout(r, 800));
    if (cmd.includes('143') || cmd.includes('123') || cmd.includes('222')) {
      return `USSD Response: Your remaining prepaid balance is P${this.balance.toFixed(2)}, valid until 30 days. Active Promo: UNLI ALLNET TXT + 10GB Data.`;
    }
    return `USSD Response OK for command: ${cmd}`;
  }
}

module.exports = new MockGoipGateway();
