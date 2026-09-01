const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_FILE = path.join(__dirname, '../data/store.json');

class Database {
  constructor() {
    this.data = {
      config: {
        gatewayIp: '192.168.8.190',
        username: 'admin',
        password: 'admin',
        line: 1,
        useMockGateway: false,
        minDelaySec: 5,
        maxDelaySec: 10,
        enableJitter: true,
        maxDailyLimit: 500,
        carrierName: 'Globe Postpaid',
        simNumber: '09173079499',
        webhookUrl: '',
        apiKey: 'tb_live_goip_admin_master'
      },
      apiKeys: [
        {
          id: 'key_master',
          name: 'Master Gateway API Key',
          key: 'tb_live_goip_admin_master',
          createdAt: new Date().toISOString()
        }
      ],
      contacts: [],
      groups: ['VIP Clients', 'General', 'Leads', 'Staff'],
      templates: [
        {
          id: 'tmpl_1',
          title: 'Appointment Reminder',
          category: 'Appointment',
          content: 'Hello {{name}}! This is a reminder for your upcoming appointment on {{date}} at {{time}}. Please reply to confirm.'
        },
        {
          id: 'tmpl_2',
          title: 'Verification OTP Code',
          category: 'Security',
          content: 'Your secure verification code is {{otp}}. This code will expire in 5 minutes. Do not share it with anyone.'
        },
        {
          id: 'tmpl_3',
          title: 'Service Notification',
          category: 'Notification',
          content: 'Hi {{name}}, your request has been processed successfully. Thank you for using our services!'
        }
      ],
      appointments: [],
      messages: [],
      logs: [],
      ussdLogs: []
    };

    this.init();
  }

  init() {
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.data,
          ...parsed,
          config: { ...this.data.config, ...(parsed.config || {}) },
          templates: parsed.templates && parsed.templates.length > 0 ? parsed.templates : this.data.templates,
          contacts: parsed.contacts || this.data.contacts,
          appointments: parsed.appointments || this.data.appointments,
          apiKeys: parsed.apiKeys && parsed.apiKeys.length > 0 ? parsed.apiKeys : this.data.apiKeys,
          groups: parsed.groups || this.data.groups
        };
      } else {
        this.saveToFile();
      }
    } catch (err) {
      // Use in-memory default
    }
  }

  saveToFile() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB Save Error]', err.message);
    }
  }

  // --- Templates ---
  getTemplates() {
    return this.data.templates || [];
  }

  addTemplate(tmpl) {
    const newTmpl = {
      id: tmpl.id || 'tmpl_' + Date.now(),
      title: tmpl.title || 'Untitled Template',
      category: tmpl.category || 'General',
      content: tmpl.content || '',
      createdAt: new Date().toISOString()
    };
    this.data.templates.unshift(newTmpl);
    this.saveToFile();
    return newTmpl;
  }

  updateTemplate(id, updates) {
    const idx = this.data.templates.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.data.templates[idx] = { ...this.data.templates[idx], ...updates };
      this.saveToFile();
      return this.data.templates[idx];
    }
    return null;
  }

  deleteTemplate(id) {
    this.data.templates = this.data.templates.filter(t => t.id !== id);
    this.saveToFile();
    return true;
  }

  // --- Contacts ---
  getContacts() {
    return this.data.contacts || [];
  }

  addContact(cnt) {
    const newCnt = {
      id: cnt.id || 'cnt_' + Date.now(),
      name: cnt.name || 'Unnamed Contact',
      phone: cnt.phone || '',
      group: cnt.group || 'General',
      notes: cnt.notes || '',
      createdAt: new Date().toISOString()
    };
    this.data.contacts.unshift(newCnt);
    if (cnt.group && !this.data.groups.includes(cnt.group)) {
      this.data.groups.push(cnt.group);
    }
    this.saveToFile();
    return newCnt;
  }

  deleteContact(id) {
    this.data.contacts = this.data.contacts.filter(c => c.id !== id);
    this.saveToFile();
    return true;
  }

  // --- Appointments ---
  getAppointments() {
    return this.data.appointments || [];
  }

  addAppointment(apt) {
    const newApt = {
      id: apt.id || 'apt_' + Date.now(),
      clientName: apt.clientName || '',
      clientPhone: apt.clientPhone || '',
      serviceType: apt.serviceType || 'General Service',
      date: apt.date || new Date().toISOString().split('T')[0],
      time: apt.time || '10:00 AM',
      status: apt.status || 'CONFIRMED',
      reminderSent: false,
      notes: apt.notes || '',
      createdAt: new Date().toISOString()
    };
    this.data.appointments.unshift(newApt);
    this.saveToFile();
    return newApt;
  }

  updateAppointment(id, updates) {
    const idx = this.data.appointments.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.data.appointments[idx] = { ...this.data.appointments[idx], ...updates };
      this.saveToFile();
      return this.data.appointments[idx];
    }
    return null;
  }

  deleteAppointment(id) {
    this.data.appointments = this.data.appointments.filter(a => a.id !== id);
    this.saveToFile();
    return true;
  }

  // --- Messages & Logs ---
  getMessages() {
    return this.data.messages || [];
  }

  addMessage(msg) {
    this.data.messages.unshift(msg);
    if (this.data.messages.length > 2000) this.data.messages = this.data.messages.slice(0, 2000);
    this.saveToFile();
  }

  updateMessage(id, updates) {
    const idx = this.data.messages.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.data.messages[idx] = { ...this.data.messages[idx], ...updates, updatedAt: new Date().toISOString() };
      this.saveToFile();
    }
  }

  updateMessageStatus(id, status, error = null, extra = {}) {
    return this.updateMessage(id, { status, error, ...extra });
  }

  getApiKeys() {
    return this.data.apiKeys || [];
  }

  addApiKey(keyData) {
    const newKey = {
      id: 'key_' + Date.now(),
      name: keyData.name || 'Application Integration Key',
      key: 'tb_live_goip_' + Buffer.from(Math.random().toString()).toString('hex').substring(0, 16),
      createdAt: new Date().toISOString()
    };
    this.data.apiKeys.unshift(newKey);
    this.saveToFile();
    return newKey;
  }

  deleteApiKey(id) {
    this.data.apiKeys = this.data.apiKeys.filter(k => k.id !== id);
    this.saveToFile();
    return true;
  }

  findApiKey(rawKey) {
    return (this.data.apiKeys || []).find(k => k.key === rawKey);
  }

  getConfig() {
    return this.data.config;
  }

  updateConfig(updates) {
    this.data.config = { ...this.data.config, ...updates };
    this.saveToFile();
    return this.data.config;
  }

  getLogs() {
    return this.data.logs || [];
  }

  addLog(type, message, details = null) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    this.data.logs.unshift(entry);
    if (this.data.logs.length > 500) this.data.logs = this.data.logs.slice(0, 500);
    this.saveToFile();
    return entry;
  }

  getUssdLogs() {
    return this.data.ussdLogs || [];
  }

  addUssdLog(log) {
    this.data.ussdLogs.unshift(log);
    if (this.data.ussdLogs.length > 100) this.data.ussdLogs = this.data.ussdLogs.slice(0, 100);
    this.saveToFile();
  }
}

module.exports = new Database();
