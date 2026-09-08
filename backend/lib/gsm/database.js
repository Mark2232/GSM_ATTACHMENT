const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_FILE = path.join(__dirname, '../../data/gsm_store.json');

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
      groups: ['VIP Clients', 'General', 'Leads', 'Staff', 'JARVIS Customers'],
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
          title: 'Customer Notification',
          category: 'Notification',
          content: 'Hi {{name}}, your order/invoice has been processed at JARVIS Auto Supply. Thank you for choosing us!'
        },
        {
          id: 'tmpl_4',
          title: 'Payment Reminder',
          category: 'Finance',
          content: 'Greetings {{name}}, this is a friendly reminder regarding your statement of account from JARVIS. Thank you!'
        }
      ],
      appointments: [],
      appointmentReminderTemplates: {
        threeDays: 'Hello {{name}}! Advance reminder from JARVIS: Your appointment for "{{serviceType}}" is scheduled in 3 days on {{date}} at {{time}}. Reply to confirm or reschedule.',
        twentyFourHours: 'Hello {{name}}! Reminder: Your appointment for "{{serviceType}}" at JARVIS is tomorrow, {{date}} at {{time}}. See you!',
        dayOf8Am: 'Good morning {{name}}! Your appointment for "{{serviceType}}" at JARVIS is scheduled for today ({{date}}) at {{time}}. We look forward to serving you!'
      },
      autoReply: {
        enabled: true,
        customerFoundTemplate: 'Hello {{name}}! Thank you for reaching JARVIS. Your customer account (#{{accountId}}) is active. Reply BALANCE for your charge balance or APPT for your appointment details.',
        balanceInquiryTemplate: 'Hello {{name}}! Your current JARVIS charge account (#{{accountId}}) balance is PHP {{balance}} (Credit Limit: PHP {{creditLimit}}). Thank you!',
        appointmentInquiryTemplate: 'Hello {{name}}! You have an upcoming appointment for "{{serviceType}}" on {{date}} at {{time}}.',
        noAppointmentTemplate: 'Hello {{name}}! You do not have any pending appointments scheduled with us. Reply with your preferred date to book a service.',
        customerNotFoundTemplate: 'Greetings from JARVIS! Your number ({{phone}}) is not yet registered in our customer records. Please visit our office or contact our support desk to register.',
        keywords: {
          balance: ['balance', 'bal', 'bill', 'due', 'utang', 'magkano', 'account', 'bayad'],
          appointment: ['appointment', 'appt', 'sched', 'schedule', 'booking', 'oras', 'petsa', 'kelan', 'service']
        }
      },
      messages: [],
      inbox: [],
      logs: [],
      ussdLogs: []
    };

    this.init();
  }

  init() {
    this.loadFromFile();
    if (!Array.isArray(this.data.inbox)) {
      this.data.inbox = [];
    }
    if (!this.data.appointmentReminderTemplates) {
      this.data.appointmentReminderTemplates = {
        threeDays: 'Hello {{name}}! Advance reminder from JARVIS: Your appointment for "{{serviceType}}" is scheduled in 3 days on {{date}} at {{time}}. Reply to confirm or reschedule.',
        twentyFourHours: 'Hello {{name}}! Reminder: Your appointment for "{{serviceType}}" at JARVIS is tomorrow, {{date}} at {{time}}. See you!',
        dayOf8Am: 'Good morning {{name}}! Your appointment for "{{serviceType}}" at JARVIS is scheduled for today ({{date}}) at {{time}}. We look forward to serving you!'
      };
    }
    if (!this.data.autoReply) {
      this.data.autoReply = {
        enabled: true,
        customerFoundTemplate: 'Hello {{name}}! Thank you for reaching JARVIS. Your customer account (#{{accountId}}) is active. Reply BALANCE for your charge balance or APPT for your appointment details.',
        balanceInquiryTemplate: 'Hello {{name}}! Your current JARVIS charge account (#{{accountId}}) balance is PHP {{balance}} (Credit Limit: PHP {{creditLimit}}). Thank you!',
        appointmentInquiryTemplate: 'Hello {{name}}! You have an upcoming appointment for "{{serviceType}}" on {{date}} at {{time}}.',
        noAppointmentTemplate: 'Hello {{name}}! You do not have any pending appointments scheduled with us. Reply with your preferred date to book a service.',
        customerNotFoundTemplate: 'Greetings from JARVIS! Your number ({{phone}}) is not yet registered in our customer records. Please visit our office or contact our support desk to register.',
        keywords: {
          balance: ['balance', 'bal', 'bill', 'due', 'utang', 'magkano', 'account', 'bayad'],
          appointment: ['appointment', 'appt', 'sched', 'schedule', 'booking', 'oras', 'petsa', 'kelan', 'service']
        }
      };
    }
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
          autoReply: { ...this.data.autoReply, ...(parsed.autoReply || {}) },
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
      console.error('[GSM DB Save Error]', err.message);
    }
  }

  getConfig() {
    return this.data.config;
  }

  updateConfig(newConfig) {
    this.data.config = { ...this.data.config, ...newConfig };
    this.saveToFile();
    return this.data.config;
  }

  getAutoReplyConfig() {
    return this.data.autoReply || {
      enabled: true,
      customerFoundTemplate: 'Hello {{name}}! Thank you for reaching JARVIS. Your customer account (#{{accountId}}) is active. Reply BALANCE for your charge balance or APPT for your appointment details.',
      balanceInquiryTemplate: 'Hello {{name}}! Your current JARVIS charge account (#{{accountId}}) balance is PHP {{balance}} (Credit Limit: PHP {{creditLimit}}). Thank you!',
      appointmentInquiryTemplate: 'Hello {{name}}! You have an upcoming appointment for "{{serviceType}}" on {{date}} at {{time}}.',
      noAppointmentTemplate: 'Hello {{name}}! You do not have any pending appointments scheduled with us. Reply with your preferred date to book a service.',
      customerNotFoundTemplate: 'Greetings from JARVIS! Your number ({{phone}}) is not yet registered in our customer records. Please visit our office or contact our support desk to register.',
      keywords: {
        balance: ['balance', 'bal', 'bill', 'due', 'utang', 'magkano', 'account', 'bayad'],
        appointment: ['appointment', 'appt', 'sched', 'schedule', 'booking', 'oras', 'petsa', 'kelan', 'service']
      }
    };
  }

  updateAutoReplyConfig(newConfig) {
    this.data.autoReply = { ...this.getAutoReplyConfig(), ...newConfig };
    this.saveToFile();
    return this.data.autoReply;
  }

  getContacts() {
    return this.data.contacts;
  }

  addContact(contact) {
    const item = {
      id: 'cnt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString(),
      ...contact
    };
    this.data.contacts.push(item);
    this.saveToFile();
    return item;
  }

  bulkAddContacts(contactList) {
    const existingPhones = new Set(this.data.contacts.map(c => c.phone.replace(/[^0-9]/g, '')));
    let added = 0;
    
    contactList.forEach(c => {
      const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
      if (cleanPhone && !existingPhones.has(cleanPhone)) {
        existingPhones.add(cleanPhone);
        this.data.contacts.push({
          id: 'cnt_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
          createdAt: new Date().toISOString(),
          name: c.name || 'Valued Customer',
          phone: c.phone,
          group: c.group || 'JARVIS Customers',
          notes: c.notes || ''
        });
        added++;
      }
    });

    if (added > 0) this.saveToFile();
    return { added, total: this.data.contacts.length };
  }

  deleteContact(id) {
    const idx = this.data.contacts.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.data.contacts.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }

  getTemplates() {
    return this.data.templates;
  }

  addTemplate(template) {
    const item = {
      id: 'tmpl_' + Date.now(),
      createdAt: new Date().toISOString(),
      ...template
    };
    this.data.templates.push(item);
    this.saveToFile();
    return item;
  }

  deleteTemplate(id) {
    const idx = this.data.templates.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.data.templates.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }

  getMessages() {
    return this.data.messages;
  }

  addMessage(msg) {
    this.data.messages.unshift(msg);
    if (this.data.messages.length > 200) {
      this.data.messages = this.data.messages.slice(0, 200);
    }
    this.saveToFile();
    return msg;
  }

  updateMessageStatus(id, status, error = null) {
    const msg = this.data.messages.find(m => m.id === id);
    if (msg) {
      msg.status = status;
      msg.updatedAt = new Date().toISOString();
      if (error) msg.error = error;
      this.saveToFile();
    }
  }

  getLogs() {
    return this.data.logs;
  }

  addLog(type, message) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      type,
      message
    };
    this.data.logs.unshift(entry);
    if (this.data.logs.length > 300) {
      this.data.logs = this.data.logs.slice(0, 300);
    }
    this.saveToFile();
    return entry;
  }

  addUssdLog(entry) {
    this.data.ussdLogs.unshift(entry);
    if (this.data.ussdLogs.length > 50) {
      this.data.ussdLogs = this.data.ussdLogs.slice(0, 50);
    }
    this.saveToFile();
  }

  getUssdLogs() {
    return this.data.ussdLogs;
  }

  getInboundMessages() {
    return this.data.inbox || [];
  }

  addInboundMessage(inbound) {
    if (!Array.isArray(this.data.inbox)) this.data.inbox = [];
    const item = {
      id: 'inb_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      from: inbound.from || inbound.sender || inbound.src || 'Unknown',
      senderName: inbound.senderName || null,
      message: inbound.message || inbound.msg || inbound.text || '',
      line: inbound.line || 1,
      receivedAt: inbound.time || new Date().toISOString(),
      read: false,
      raw: inbound.raw || null
    };
    this.data.inbox.unshift(item);
    if (this.data.inbox.length > 300) {
      this.data.inbox = this.data.inbox.slice(0, 300);
    }
    this.addLog('info', `[Inbound SMS] Received reply from ${item.from}: "${item.message.slice(0, 40)}..."`);
    this.saveToFile();
    return item;
  }

  deleteInboundMessage(id) {
    if (!Array.isArray(this.data.inbox)) return false;
    const initial = this.data.inbox.length;
    this.data.inbox = this.data.inbox.filter(i => i.id !== id);
    this.saveToFile();
    return this.data.inbox.length < initial;
  }

  markInboundRead(id) {
    if (!Array.isArray(this.data.inbox)) return false;
    const msg = this.data.inbox.find(i => i.id === id);
    if (msg) {
      msg.read = true;
      this.saveToFile();
      return true;
    }
    return false;
  }

  markAllInboundRead(phone) {
    if (!Array.isArray(this.data.inbox)) return 0;
    let count = 0;
    const cleanTarget = phone ? phone.replace(/[^0-9]/g, '').slice(-10) : null;
    this.data.inbox.forEach(msg => {
      const msgClean = (msg.from || '').replace(/[^0-9]/g, '').slice(-10);
      if (!cleanTarget || msgClean === cleanTarget) {
        if (!msg.read) {
          msg.read = true;
          count++;
        }
      }
    });
    if (count > 0) this.saveToFile();
    return count;
  }

  deleteInboundThread(phone) {
    if (!Array.isArray(this.data.inbox) || !phone) return false;
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    const initial = this.data.inbox.length;
    this.data.inbox = this.data.inbox.filter(msg => {
      const msgPhone = (msg.from || '').replace(/[^0-9]/g, '').slice(-10);
      return msgPhone !== cleanPhone;
    });
    this.saveToFile();
    return this.data.inbox.length < initial;
  }

  getAppointmentReminderTemplates() {
    return this.data.appointmentReminderTemplates || {
      threeDays: 'Hello {{name}}! Advance reminder from JARVIS: Your appointment for "{{serviceType}}" is scheduled in 3 days on {{date}} at {{time}}. Reply to confirm or reschedule.',
      twentyFourHours: 'Hello {{name}}! Reminder: Your appointment for "{{serviceType}}" at JARVIS is tomorrow, {{date}} at {{time}}. See you!',
      dayOf8Am: 'Good morning {{name}}! Your appointment for "{{serviceType}}" at JARVIS is scheduled for today ({{date}}) at {{time}}. We look forward to serving you!'
    };
  }

  updateAppointmentReminderTemplates(newTemplates) {
    this.data.appointmentReminderTemplates = {
      ...this.getAppointmentReminderTemplates(),
      ...newTemplates
    };
    this.saveToFile();
    return this.data.appointmentReminderTemplates;
  }

  getAppointments() {
    return this.data.appointments || [];
  }

  addAppointment(appt) {
    if (!Array.isArray(this.data.appointments)) this.data.appointments = [];
    const item = {
      id: 'apt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString(),
      status: 'SCHEDULED',
      reminders: {
        threeDays: { sent: false },
        twentyFourHours: { sent: false },
        dayOf: { sent: false }
      },
      ...appt
    };
    this.data.appointments.unshift(item);
    this.saveToFile();
    return item;
  }

  updateAppointmentReminderStatus(id, stage, statusData) {
    if (!Array.isArray(this.data.appointments)) return false;
    const appt = this.data.appointments.find(a => a.id === id);
    if (!appt) return false;

    if (!appt.reminders) {
      appt.reminders = {
        threeDays: { sent: false },
        twentyFourHours: { sent: false },
        dayOf: { sent: false }
      };
    }

    const key = stage === '3days' ? 'threeDays' : stage === '24hours' ? 'twentyFourHours' : 'dayOf';
    appt.reminders[key] = {
      ...appt.reminders[key],
      ...statusData
    };

    this.saveToFile();
    return true;
  }

  deleteAppointment(id) {
    if (!Array.isArray(this.data.appointments)) return false;
    const initial = this.data.appointments.length;
    this.data.appointments = this.data.appointments.filter(a => a.id !== id);
    this.saveToFile();
    return this.data.appointments.length < initial;
  }
}

module.exports = new Database();
