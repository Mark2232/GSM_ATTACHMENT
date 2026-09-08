const express = require('express');
const router = express.Router();
const db = require('../lib/gsm/database');
const queueEngine = require('../lib/gsm/queueEngine');
const goipDriver = require('../lib/gsm/goipDriver');
const smartAutoReply = require('../lib/gsm/smartAutoReply');
const inboundPoller = require('../lib/gsm/inboundPoller');
const appointmentScheduler = require('../lib/gsm/appointmentScheduler');

// ─── Smart Auto-Reply Configuration & Simulation ─────────────────────────

router.get('/auto-reply/config', (req, res) => {
  try {
    res.json(db.getAutoReplyConfig());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auto-reply/config', (req, res) => {
  try {
    const updated = db.updateAutoReplyConfig(req.body);
    res.json({ success: true, autoReply: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auto-reply/simulate', async (req, res) => {
  try {
    const { from, message } = req.body;
    if (!from) {
      return res.status(400).json({ error: 'Phone number (from) is required for simulation' });
    }
    const result = await smartAutoReply.processInboundMessage({
      from,
      message: message || 'Inquiry',
      line: 1,
      autoSend: false // Simulation preview only
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Hardware & Config ───────────────────────────────────────────────────────

router.get('/hardware/status', async (req, res) => {
  try {
    const status = await goipDriver.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/config', (req, res) => {
  res.json(db.getConfig());
});

router.post('/config', (req, res) => {
  try {
    const updated = db.updateConfig(req.body);
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Direct SMS Dispatch ───────────────────────────────────────────────────

router.post('/send', async (req, res) => {
  const { recipient, phone, to, phones, recipients, message, name, priority } = req.body;
  const targetList = phones || recipients || (recipient ? [recipient] : phone ? [phone] : to ? [to] : []);
  
  if (targetList.length === 0 || !message) {
    return res.status(400).json({ error: 'recipient (or phone) and message are required' });
  }

  // If bulk list (more than 1) or priority queue requested:
  if (targetList.length > 1) {
    const enqueued = [];
    for (const r of targetList) {
      const item = queueEngine.enqueue(r, message, { priority: !!priority, recipientName: name });
      enqueued.push(item);
    }
    return res.json({
      success: true,
      message: `Enqueued ${enqueued.length} messages into outbound rate-limited queue`,
      queuedCount: enqueued.length
    });
  }

  const targetPhone = targetList[0];
  const config = db.getConfig();
  const line = config.line || 1;
  const msgId = 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

  try {
    const result = await goipDriver.sendSms(line, targetPhone, message);
    const logEntry = {
      id: msgId,
      recipient: targetPhone,
      to: targetPhone,
      phone: targetPhone,
      message,
      status: 'SENT',
      createdAt: new Date().toISOString(),
      metadata: { recipientName: name || 'Valued Customer' }
    };
    db.addMessage(logEntry);
    db.addLog('success', `Direct SMS sent to ${targetPhone}`);
    res.json({
      success: true,
      message: 'SMS sent successfully via GSM Gateway',
      data: logEntry
    });
  } catch (err) {
    const logEntry = {
      id: msgId,
      recipient: targetPhone,
      to: targetPhone,
      phone: targetPhone,
      message,
      status: 'FAILED',
      error: err.message,
      createdAt: new Date().toISOString(),
      metadata: { recipientName: name || 'Valued Customer' }
    };
    db.addMessage(logEntry);
    db.addLog('error', `Failed to send SMS to ${targetPhone}: ${err.message}`);
    res.status(500).json({ error: err.message, data: logEntry });
  }
});

router.post('/bulk', async (req, res) => {
  const { recipients, message } = req.body;
  if (!Array.isArray(recipients) || recipients.length === 0 || !message) {
    return res.status(400).json({ error: 'recipients array and message are required' });
  }

  const config = db.getConfig();
  const line = config.line || 1;
  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    const phone = typeof r === 'object' && r !== null ? (r.phone || r.recipient) : String(r);
    const name = typeof r === 'object' && r !== null ? (r.name || 'Valued Costumer') : 'Valued Costumer';
    if (!phone) continue;

    const personalizedMsg = message.replace(/\{\{\s*name\s*\}\}/gi, name);
    const msgId = 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    try {
      await goipDriver.sendSms(line, phone, personalizedMsg);
      db.addMessage({
        id: msgId,
        recipient: phone,
        message: personalizedMsg,
        status: 'SENT',
        createdAt: new Date().toISOString(),
        metadata: { recipientName: name }
      });
      sentCount++;
    } catch (err) {
      db.addMessage({
        id: msgId,
        recipient: phone,
        message: personalizedMsg,
        status: 'FAILED',
        error: err.message,
        createdAt: new Date().toISOString(),
        metadata: { recipientName: name }
      });
      failedCount++;
    }
  }

  db.addLog('info', `Direct Bulk dispatch: ${sentCount} sent, ${failedCount} failed`);
  res.json({
    success: true,
    sentCount,
    failedCount,
    total: recipients.length,
    message: `Directly dispatched ${sentCount} of ${recipients.length} messages.`
  });
});

router.get('/messages', (req, res) => {
  res.json(db.getMessages());
});

router.get('/logs', (req, res) => {
  res.json(db.getLogs());
});

// ─── Templates ───────────────────────────────────────────────────────────────

router.get('/templates', (req, res) => {
  res.json(db.getTemplates());
});

router.post('/templates', (req, res) => {
  const tmpl = db.addTemplate(req.body);
  res.json({ success: true, data: tmpl });
});

router.delete('/templates/:id', (req, res) => {
  const success = db.deleteTemplate(req.params.id);
  res.json({ success });
});

// ─── Contacts & Groups ───────────────────────────────────────────────────────

router.get('/contacts', (req, res) => {
  res.json(db.getContacts());
});

router.post('/contacts', (req, res) => {
  const { name, phone, group, notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const item = db.addContact({ name: name || 'Unnamed', phone, group: group || 'General', notes });
  res.json({ success: true, data: item });
});

router.delete('/contacts/:id', (req, res) => {
  const success = db.deleteContact(req.params.id);
  res.json({ success });
});

// ─── USSD Terminal & Real SIM Balance ──────────────────────────────────────────

router.post('/ussd/send', async (req, res) => {
  const { command, line } = req.body;
  if (!command) return res.status(400).json({ error: 'USSD command is required' });

  try {
    const rawResult = await goipDriver.runUssd(line || 1, command);
    const entry = {
      id: 'ussd_' + Date.now(),
      command,
      response: typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult),
      timestamp: new Date().toISOString()
    };
    db.addUssdLog(entry);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Real Balance Check
router.post('/ussd/check-balance', async (req, res) => {
  const { line, carrier } = req.body;
  const config = db.getConfig();
  const targetLine = line || config.line || 1;

  // Determine standard balance inquiry command
  // Globe/TM: *222# or *143#; Smart/TNT: *133# or *123#; DITO: *185#
  let cmd = '*222#';
  const carrierLower = (carrier || config.carrierName || '').toLowerCase();
  if (carrierLower.includes('smart') || carrierLower.includes('tnt') || carrierLower.includes('sun')) {
    cmd = '*133#';
  } else if (carrierLower.includes('dito')) {
    cmd = '*185#';
  }

  try {
    const rawResult = await goipDriver.runUssd(targetLine, cmd);
    const text = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);

    // Extract balance amount and expiry if pattern matches
    const balanceMatch = text.match(/(?:P|PHP|Php|₱)\s*([0-9]+(?:\.[0-9]{2})?)/i) ||
                         text.match(/balance\s*(?:is|:)?\s*(?:P|PHP|₱)?\s*([0-9]+(?:\.[0-9]{2})?)/i);
    const expiryMatch = text.match(/valid\s*(?:until|thru|to)?\s*([A-Za-z0-9\s,\/\-]+?)(?:\.|$)/i);

    const balanceInfo = {
      raw: text,
      amount: balanceMatch ? balanceMatch[1] : null,
      expiry: expiryMatch ? expiryMatch[1].trim() : null,
      commandUsed: cmd,
      checkedAt: new Date().toISOString()
    };

    const entry = {
      id: 'ussd_bal_' + Date.now(),
      command: cmd,
      response: text,
      timestamp: new Date().toISOString()
    };
    db.addUssdLog(entry);

    res.json({
      success: true,
      balance: balanceInfo,
      data: entry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ussd/logs', (req, res) => {
  res.json(db.getUssdLogs());
});

// ─── Appointments & 3-Stage Automated Reminders (PHT / Asia/Manila) ─────────

router.get('/appointments', (req, res) => {
  res.json(db.getAppointments());
});

// Get 3-Stage Reminder Scheduler Status & Philippine Time
router.get('/appointments/reminder-status', (req, res) => {
  res.json(appointmentScheduler.getStatus());
});

// Force Check / Run Scheduler Scan
router.post('/appointments/check-reminders', async (req, res) => {
  try {
    const result = await appointmentScheduler.checkAndDispatchReminders();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Appointment Reminder SMS Templates
router.get('/appointments/templates', (req, res) => {
  res.json(db.getAppointmentReminderTemplates());
});

// Update Appointment Reminder SMS Templates
router.post('/appointments/templates', (req, res) => {
  try {
    const updated = db.updateAppointmentReminderTemplates(req.body);
    res.json({ success: true, templates: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/appointments', async (req, res) => {
  const { clientName, clientPhone, serviceType, date, time, notes, sendAutoReminder } = req.body;
  if (!clientName || !clientPhone) {
    return res.status(400).json({ error: 'Client Name and Phone Number are required' });
  }

  const appt = db.addAppointment({
    clientName,
    clientPhone,
    serviceType: serviceType || 'General Consultation & Service',
    date: date || new Date().toISOString().split('T')[0],
    time: time || '10:00 AM',
    notes: notes || '',
    sendAutoReminder: sendAutoReminder !== false
  });

  // If initial confirmation SMS is requested, dispatch direct SMS
  let smsStatus = 'SKIPPED';
  if (sendAutoReminder) {
    const confirmationText = `Hello ${clientName}! Your appointment for "${appt.serviceType}" at JARVIS is confirmed for ${appt.date} at ${appt.time}. Please reply to confirm.`;
    try {
      await goipDriver.sendSms(1, clientPhone, confirmationText);
      db.addMessage({
        id: 'msg_appt_' + Date.now(),
        recipient: clientPhone,
        message: confirmationText,
        status: 'SENT',
        createdAt: new Date().toISOString(),
        metadata: { appointmentId: appt.id, clientName }
      });
      smsStatus = 'SENT';
      db.addLog('info', `[Appointment SMS] Confirmation dispatched to ${clientName} (${clientPhone})`);
    } catch (err) {
      smsStatus = 'FAILED';
      db.addLog('error', `[Appointment SMS Failed] Could not dispatch to ${clientPhone}: ${err.message}`);
    }
  }

  res.json({ success: true, ...appt, data: appt, smsStatus });
});

router.delete('/appointments/:id', (req, res) => {
  const success = db.deleteAppointment(req.params.id);
  res.json({ success });
});

// Trigger a specific 3-Stage Reminder milestone manually ('3days' | '24hours' | 'dayof')
router.post('/appointments/:id/trigger-reminder', async (req, res) => {
  const appts = db.getAppointments();
  const appt = appts.find(a => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  const { stage, customMessage } = req.body;
  const targetStage = stage || '3days';

  try {
    const result = await appointmentScheduler.dispatchReminder(appt, targetStage, customMessage);
    res.json({ success: true, result, stage: targetStage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/appointments/:id/send-sms', async (req, res) => {
  const appts = db.getAppointments();
  const appt = appts.find(a => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  const text = req.body.customMessage || `Hello ${appt.clientName}! This is a reminder for your upcoming appointment for "${appt.serviceType}" at JARVIS on ${appt.date} at ${appt.time}. Thank you!`;
  try {
    const result = await goipDriver.sendSms(1, appt.clientPhone, text);
    db.addMessage({
      id: 'msg_appt_rem_' + Date.now(),
      recipient: appt.clientPhone,
      message: text,
      status: 'SENT',
      createdAt: new Date().toISOString(),
      metadata: { appointmentId: appt.id, clientName: appt.clientName }
    });
    db.addLog('info', `[Manual Reminder] Dispatched to ${appt.clientName} (${appt.clientPhone})`);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 🌟 SYSTEM INTEGRATION: Fetch Customer Contacts Only ───────

router.get('/system-contacts', async (req, res) => {
  try {
    const parsedContacts = [];

    // 1. Fetch ALL registered charge account customers (even without phone number)
    try {
      const [custRows] = await pool.query(`
        SELECT 
          ca.AccountId as id,
          ca.AccountName as name,
          ca.ContactNo as rawPhone,
          ca.Address as address,
          ca.CreditLimit as creditLimit,
          ca.IsActive as isActive,
          COUNT(DISTINCT t.PosId) as totalTransactions,
          MAX(t.DateSale) as latestSaleDate,
          COALESCE(SUM(CASE WHEN (t.IsPaid = 0 OR t.IsPaid IS NULL) AND t.IsVoidInvoice = 0 THEN COALESCE(pi.SellingPrice, pi.Price, 0) * COALESCE(pi.Qty, 1) ELSE 0 END), 0) as openBalance
        FROM tablechargeaccount ca
        LEFT JOIN tablepos t ON ca.AccountId = t.AccountId AND t.IsVoidInvoice = 0
        LEFT JOIN tablepositem pi ON t.PosId = pi.PosId
        GROUP BY ca.AccountId, ca.AccountName, ca.ContactNo, ca.Address, ca.CreditLimit, ca.IsActive
        ORDER BY totalTransactions DESC, ca.AccountName ASC
      `);

      custRows.forEach(c => {
        const raw = String(c.rawPhone || '').trim();
        const hasPhone = raw && raw !== '-' && raw.toLowerCase() !== 'n/a' && raw.toLowerCase() !== 'null';
        const phones = hasPhone ? raw.split(/[\/,;]/).map(p => p.trim()).filter(Boolean) : [];
        const balanceNum = Number(c.openBalance || 0);
        const formattedBalance = balanceNum > 0 ? balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00';
        const formattedLimit = Number(c.creditLimit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
        
        if (phones.length > 0) {
          phones.forEach((phone, idx) => {
            parsedContacts.push({
              id: `cust_${c.id}_${idx}`,
              accountId: c.id,
              name: c.name,
              phone: phone,
              rawPhone: raw,
              address: c.address || '',
              creditLimit: formattedLimit,
              balance: formattedBalance,
              rawBalance: balanceNum,
              totalTransactions: c.totalTransactions || 0,
              latestSaleDate: c.latestSaleDate,
              type: 'Charge Customer'
            });
          });
        } else {
          // Customer without phone: include with blank phone so info is fully accessible
          parsedContacts.push({
            id: `cust_${c.id}_0`,
            accountId: c.id,
            name: c.name,
            phone: '',
            rawPhone: '',
            address: c.address || '',
            creditLimit: formattedLimit,
            balance: formattedBalance,
            rawBalance: balanceNum,
            totalTransactions: c.totalTransactions || 0,
            latestSaleDate: c.latestSaleDate,
            type: 'Charge Customer'
          });
        }
      });
    } catch (custErr) {
      console.error('[GSM Charge Accounts Error]', custErr.message);
    }

    // Include manually added customer contacts, excluding staff contacts.
    const localContacts = db.getContacts().filter(contact => String(contact.group || '').trim().toLowerCase() !== 'staff');
    localContacts.forEach(lc => {
      parsedContacts.unshift({
        id: lc.id,
        accountId: null,
        name: lc.name,
        phone: lc.phone || '',
        rawPhone: lc.phone || '',
        address: lc.address || lc.notes || 'Manual Entry',
        creditLimit: '0.00',
        balance: '0.00',
        rawBalance: 0,
        totalTransactions: 0,
        latestSaleDate: lc.createdAt,
        type: lc.group || 'Custom Contact'
      });
    });

    res.json({
      success: true,
      totalCount: parsedContacts.length,
      customers: parsedContacts
    });
  } catch (err) {
    console.error('[GSM System Contacts Error]', err.message);
    res.status(500).json({ error: 'Failed to fetch system contacts: ' + err.message });
  }
});

// Dedicated Real-Time Customer Lookup & Info Extraction (for Balance, Appointment, Account Inquiries)
router.get('/customer-inquiry', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, customers: [] });
    }

    const appts = db.getAppointments();
    const results = [];

    // 1. Search tablechargeaccount
    try {
      const nameTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const nameConditions = nameTerms.map(() => 'LOCATE(?, LOWER(ca.AccountName)) > 0').join(' AND ');
      const [rows] = await pool.query(`
        SELECT 
          ca.AccountId as accountId,
          ca.AccountName as name,
          ca.ContactNo as phone,
          ca.Address as address,
          ca.CreditLimit as creditLimit,
          COUNT(DISTINCT t.PosId) as totalTransactions,
          MAX(t.DateSale) as latestSaleDate,
          COALESCE(SUM(CASE WHEN (t.IsPaid = 0 OR t.IsPaid IS NULL) AND t.IsVoidInvoice = 0 THEN COALESCE(pi.SellingPrice, pi.Price, 0) * COALESCE(pi.Qty, 1) ELSE 0 END), 0) as openBalance
        FROM tablechargeaccount ca
        LEFT JOIN tablepos t ON ca.AccountId = t.AccountId AND t.IsVoidInvoice = 0
        LEFT JOIN tablepositem pi ON t.PosId = pi.PosId
        WHERE (${nameConditions}) OR ca.ContactNo LIKE ? OR CAST(ca.AccountId AS CHAR) LIKE ? OR ca.Address LIKE ?
        GROUP BY ca.AccountId, ca.AccountName, ca.ContactNo, ca.Address, ca.CreditLimit
        ORDER BY ca.AccountName ASC
      `, [...nameTerms, `%${q}%`, `%${q}%`, `%${q}%`]);

      rows.forEach(r => {
        const balanceNum = Number(r.openBalance || 0);
        const rawP = String(r.phone || '').trim();
        const phoneClean = (rawP && rawP !== '-' && rawP.toLowerCase() !== 'n/a' && rawP.toLowerCase() !== 'null') ? rawP : '';

        const matchedAppt = appts.find(a => 
          (phoneClean && a.clientPhone && a.clientPhone.replace(/[^0-9]/g, '').slice(-10) === phoneClean.replace(/[^0-9]/g, '').slice(-10)) ||
          (a.clientName && a.clientName.toLowerCase().trim() === r.name.toLowerCase().trim())
        );

        results.push({
          accountId: r.accountId,
          name: r.name,
          phone: phoneClean,
          address: r.address || '',
          creditLimit: Number(r.creditLimit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
          balance: balanceNum > 0 ? balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00',
          rawBalance: balanceNum,
          totalTransactions: r.totalTransactions || 0,
          latestSaleDate: r.latestSaleDate,
          type: 'Charge Customer',
          appointment: matchedAppt ? {
            serviceType: matchedAppt.serviceType,
            date: matchedAppt.date,
            time: matchedAppt.time,
            status: matchedAppt.status
          } : null
        });
      });
    } catch (err) {
      console.warn('[Inquiry ChargeAccount Error]', err.message);
    }

    res.json({ success: true, customers: results });
  } catch (err) {
    console.error('[Customer Inquiry Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 📥 INBOUND SMS / CLIENT REPLIES
// ==========================================

// Force sync latest hardware SMS from GoIP device
router.post('/inbox/sync', async (req, res) => {
  try {
    const result = await inboundPoller.syncHardwareInbox();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all received inbound SMS replies (with automatic hardware synchronization)
router.get('/inbox', async (req, res) => {
  try {
    // Auto-sync hardware SMS
    try {
      await inboundPoller.syncHardwareInbox();
    } catch (syncErr) {
      console.warn('[GSM Hardware Inbox Sync Warn]', syncErr.message);
    }

    const rawInbox = db.getInboundMessages();
    
    // Auto-match phone numbers with system customers to display names
    let systemLookup = new Map();
    try {
      const [rows] = await pool.query(`
        SELECT AccountId, AccountName as Name, ContactNo, Address 
        FROM tablechargeaccount 
        WHERE ContactNo IS NOT NULL AND TRIM(ContactNo) != ''
      `);
      rows.forEach(r => {
        const clean = (r.ContactNo || '').replace(/[^0-9]/g, '');
        if (clean.length >= 7) {
          systemLookup.set(clean.slice(-10), { name: r.Name, address: r.Address, accountId: r.AccountId });
        }
      });
    } catch (e) {}

    // Match local contacts
    db.getContacts().forEach(c => {
      const clean = (c.phone || '').replace(/[^0-9]/g, '');
      if (clean.length >= 7 && !systemLookup.has(clean.slice(-10))) {
        systemLookup.set(clean.slice(-10), { name: c.name, address: c.address || c.notes, accountId: null });
      }
    });

    const enrichedInbox = rawInbox.map(msg => {
      const cleanPhone = (msg.from || '').replace(/[^0-9]/g, '');
      const matched = systemLookup.get(cleanPhone.slice(-10));
      return {
        ...msg,
        senderName: matched ? matched.name : (msg.senderName || 'Unknown Costumer'),
        senderAddress: matched ? matched.address : null,
        senderAccountId: matched ? matched.accountId : null
      };
    });

    res.json({
      success: true,
      count: enrichedInbox.length,
      unreadCount: enrichedInbox.filter(i => !i.read).length,
      messages: enrichedInbox
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inbound webhook receiver for GoIP-1 SMS Forwarding (Supports POST & GET)
const handleInboundSms = async (req, res) => {
  try {
    const data = { ...req.query, ...req.body };
    const from = data.src || data.from || data.sender || data.phone || data.mobile;
    const message = data.msg || data.text || data.message || data.content;
    const line = Number(data.line || data.port || 1);
    const time = data.time || data.date || new Date().toISOString();

    if (!from || !message) {
      return res.status(400).json({ error: 'Missing from/src and msg/text fields' });
    }

    const cleanFrom = String(from).trim();
    const cleanMessage = String(message).trim();

    // 🤖 Execute Smart Auto-Reply Engine
    let autoReplyResult = null;
    try {
      autoReplyResult = await smartAutoReply.processInboundMessage({
        from: cleanFrom,
        message: cleanMessage,
        line,
        autoSend: true
      });
    } catch (autoErr) {
      console.error('[SmartAutoReply Engine Error]', autoErr.message);
    }

    const saved = db.addInboundMessage({
      from: cleanFrom,
      message: cleanMessage,
      line,
      time,
      raw: data,
      autoReply: autoReplyResult ? {
        enabled: autoReplyResult.autoReplyEnabled,
        customerFound: autoReplyResult.customerFound,
        matchedCustomer: autoReplyResult.customer,
        intent: autoReplyResult.intent,
        reasoning: autoReplyResult.reasoning,
        replyText: autoReplyResult.replyText,
        dispatchResult: autoReplyResult.dispatchResult
      } : null
    });

    res.json({
      success: true,
      message: 'Inbound SMS received and processed by Smart Engine',
      data: saved,
      autoReply: autoReplyResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.post('/inbound', handleInboundSms);
router.get('/inbound', handleInboundSms);

// Simulate / Test Inbound Reply with Smart Auto-Reply Execution
router.post('/inbox/test-reply', async (req, res) => {
  try {
    const { from, message } = req.body;
    const cleanFrom = from || '09173079499';
    const cleanMessage = message || 'BALANCE';

    // Execute Smart Auto-Reply Engine
    const autoReplyResult = await smartAutoReply.processInboundMessage({
      from: cleanFrom,
      message: cleanMessage,
      line: 1,
      autoSend: true
    });

    const saved = db.addInboundMessage({
      from: cleanFrom,
      senderName: autoReplyResult.customer ? autoReplyResult.customer.name : 'Simulated Sender',
      message: cleanMessage,
      line: 1,
      time: new Date().toISOString(),
      autoReply: {
        enabled: autoReplyResult.autoReplyEnabled,
        customerFound: autoReplyResult.customerFound,
        matchedCustomer: autoReplyResult.customer,
        intent: autoReplyResult.intent,
        reasoning: autoReplyResult.reasoning,
        replyText: autoReplyResult.replyText,
        dispatchResult: autoReplyResult.dispatchResult
      }
    });

    res.json({
      success: true,
      message: 'Simulated inbound reply created & smart auto-reply processed',
      data: saved,
      autoReply: autoReplyResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Smart Auto-Reply Configuration & Simulation ─────────────────────────

router.get('/auto-reply/config', (req, res) => {
  res.json(db.getAutoReplyConfig());
});

router.post('/auto-reply/config', (req, res) => {
  const updated = db.updateAutoReplyConfig(req.body);
  res.json({ success: true, autoReply: updated });
});

router.post('/auto-reply/simulate', async (req, res) => {
  try {
    const { from, message } = req.body;
    const cleanFrom = from || '09173079499';
    const cleanMessage = message || 'what is the weather today';

    const autoReplyResult = await smartAutoReply.processInboundMessage({
      from: cleanFrom,
      message: cleanMessage,
      line: 1,
      autoSend: false // simulation only
    });

    res.json({
      success: true,
      autoReplyEnabled: autoReplyResult.autoReplyEnabled,
      customerFound: autoReplyResult.customerFound,
      customer: autoReplyResult.customer,
      appointment: autoReplyResult.appointment,
      intent: autoReplyResult.intent,
      thought: autoReplyResult.thought,
      reasoning: autoReplyResult.reasoning,
      replyText: autoReplyResult.replyText
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all inbound messages or thread as read
router.post('/inbox/read-all', (req, res) => {
  const { phone } = req.body || {};
  const count = db.markAllInboundRead(phone);
  res.json({ success: true, count });
});

// Delete entire inbound thread for a phone number
router.delete('/inbox/thread/:phone', (req, res) => {
  const success = db.deleteInboundThread(req.params.phone);
  res.json({ success });
});

// Delete inbound message
router.delete('/inbox/:id', (req, res) => {
  const success = db.deleteInboundMessage(req.params.id);
  res.json({ success });
});

// Mark inbound message as read
router.post('/inbox/:id/read', (req, res) => {
  const success = db.markInboundRead(req.params.id);
  res.json({ success });
});

module.exports = router;
