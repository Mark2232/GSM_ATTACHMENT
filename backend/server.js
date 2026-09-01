const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./lib/database');
const queueEngine = require('./lib/queueEngine');
const goipDriver = require('./lib/goipDriver');
const goipDiscovery = require('./lib/goipDiscovery');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Enable JSON Parsing & CORS for easy attachment by any external system
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Broadcast helper for real-time WebSocket clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Connect Queue Engine to WebSocket Broadcaster
queueEngine.setBroadcaster((data) => {
  broadcast({ type: 'QUEUE_UPDATE', payload: data });
});

// Periodic Hardware Heartbeat
setInterval(async () => {
  try {
    const hwStatus = await goipDriver.getStatus();
    broadcast({
      type: 'HARDWARE_STATUS',
      payload: hwStatus
    });
  } catch (err) {}
}, 5000);

// =========================================================================
// 🚀 UNIVERSAL DEVELOPER REST API (For attaching any external app / CRM / POS)
// =========================================================================

/**
 * Universal SMS Send Endpoint for 3rd-party software
 * Supports single recipient (recipient / to / number) or multiple (recipients / numbers)
 */
app.post('/api/v1/gateway/send', (req, res) => {
  const rawRecipient = req.body.recipient || req.body.to || req.body.number || req.body.recipients || req.body.numbers;
  const message = req.body.message || req.body.text || req.body.content;
  const priority = req.body.priority || 'NORMAL';

  if (!rawRecipient || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: "recipient" (or "to"/"recipients") and "message" (or "text") are required.'
    });
  }

  // Handle single vs array of recipients
  if (Array.isArray(rawRecipient)) {
    const items = rawRecipient.map(r => {
      const phone = typeof r === 'object' && r !== null ? (r.phone || r.recipient || r.to) : String(r);
      if (!phone) return null;
      return queueEngine.enqueue(phone, message, { source: 'DEVELOPER_API_V1', priority });
    }).filter(Boolean);

    db.addLog('info', `[Developer API] Queued ${items.length} messages from external system`);
    return res.status(202).json({
      success: true,
      status: 'QUEUED_FOR_DISPATCH',
      count: items.length,
      message: `Successfully queued ${items.length} SMS for GoIP-1 transmission`,
      messages: items
    });
  }

  const queuedItem = queueEngine.enqueue(String(rawRecipient), String(message), {
    source: 'DEVELOPER_API_V1',
    priority
  });

  db.addLog('info', `[Developer API] Queued SMS to ${rawRecipient} from external system`);
  res.status(202).json({
    success: true,
    status: 'QUEUED_FOR_DISPATCH',
    messageId: queuedItem.id,
    recipient: queuedItem.recipient,
    parts: queuedItem.parts,
    timestamp: queuedItem.createdAt
  });
});

/**
 * Universal Status Endpoint for 3rd-party software health-checks
 */
app.get('/api/v1/gateway/status', async (req, res) => {
  const hw = await goipDriver.getStatus();
  const queue = queueEngine.getSnapshot();
  res.json({
    gateway: 'Jarvis GSM SMS Gateway (GoIP-1)',
    online: hw.status === 'ONLINE',
    simState: hw.simState,
    simNumber: hw.simNumber,
    carrier: hw.carrier,
    signalBars: hw.signalBars,
    queueSize: queue.queue.length,
    isProcessing: queue.isProcessing,
    isPaused: queue.isPaused,
    stats: queue.stats
  });
});

// ==========================================
// 📤 SMS DISPATCH & QUEUE
// ==========================================

app.post('/api/sms/send', (req, res) => {
  const { recipient, message } = req.body;
  if (!recipient || !message) {
    return res.status(400).json({ error: 'recipient and message are required' });
  }

  const queuedItem = queueEngine.enqueue(recipient, message);
  res.json({
    success: true,
    message: 'SMS queued successfully for GoIP-1 transmission',
    data: queuedItem
  });
});

app.post('/api/sms/bulk', (req, res) => {
  const { recipients, message } = req.body;
  if (!Array.isArray(recipients) || recipients.length === 0 || !message) {
    return res.status(400).json({ error: 'recipients must be a non-empty array and message is required' });
  }

  const items = recipients.map(r => {
    let targetPhone = '';
    let targetName = 'Valued Client';

    if (typeof r === 'object' && r !== null) {
      targetPhone = r.phone || r.recipient || '';
      targetName = r.name || 'Valued Client';
    } else {
      targetPhone = String(r);
    }

    if (!targetPhone) return null;

    // Personalize message if {{name}} variable exists
    const personalizedMessage = message.replace(/\{\{\s*name\s*\}\}/gi, targetName);

    return queueEngine.enqueue(targetPhone, personalizedMessage, {
      recipientName: targetName
    });
  }).filter(Boolean);

  res.json({
    success: true,
    count: items.length,
    message: `Queued ${items.length} personalized messages for GoIP-1 dispatch`,
    data: items
  });
});

app.get('/api/queue', (req, res) => {
  res.json(queueEngine.getSnapshot());
});

app.post('/api/queue/pause', (req, res) => {
  queueEngine.pause();
  res.json({ success: true, isPaused: true });
});

app.post('/api/queue/resume', (req, res) => {
  queueEngine.resume();
  res.json({ success: true, isPaused: false });
});

app.delete('/api/queue/clear', (req, res) => {
  queueEngine.clearQueue();
  res.json({ success: true });
});

app.delete('/api/queue/item/:id', (req, res) => {
  const success = queueEngine.cancelItem(req.params.id);
  res.json({ success });
});

app.get('/api/messages', (req, res) => {
  res.json(db.getMessages());
});

// ==========================================
// 👥 CONTACTS & GROUPS
// ==========================================

app.get('/api/contacts', (req, res) => {
  res.json(db.getContacts());
});

app.post('/api/contacts', (req, res) => {
  const { name, phone, group, notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const item = db.addContact({ name: name || 'Unnamed', phone, group: group || 'General', notes });
  broadcast({ type: 'CONTACTS_UPDATED', payload: item });
  res.json({ success: true, data: item });
});

app.delete('/api/contacts/:id', (req, res) => {
  const success = db.deleteContact(req.params.id);
  broadcast({ type: 'CONTACTS_UPDATED', payload: null });
  res.json({ success });
});

// ==========================================
// 📝 MESSAGE TEMPLATES
// ==========================================

app.get('/api/templates', (req, res) => {
  res.json(db.getTemplates());
});

app.post('/api/templates', (req, res) => {
  const tmpl = db.addTemplate(req.body);
  broadcast({ type: 'TEMPLATES_UPDATED', payload: tmpl });
  res.json({ success: true, data: tmpl });
});

app.delete('/api/templates/:id', (req, res) => {
  const success = db.deleteTemplate(req.params.id);
  broadcast({ type: 'TEMPLATES_UPDATED', payload: null });
  res.json({ success });
});

// ==========================================
// 📅 APPOINTMENTS & SCHEDULING
// ==========================================

app.get('/api/appointments', (req, res) => {
  res.json(db.getAppointments());
});

app.post('/api/appointments', (req, res) => {
  const { clientName, clientPhone, serviceType, date, time, notes, sendAutoReminder } = req.body;
  if (!clientPhone || !clientName) return res.status(400).json({ error: 'Client name and phone are required' });

  const item = db.addAppointment({ clientName, clientPhone, serviceType, date, time, notes });

  if (sendAutoReminder) {
    const msg = `Hello ${clientName}! Your appointment for ${serviceType || 'service'} is scheduled on ${date} at ${time}. Notes: ${notes || 'None'}.`;
    queueEngine.enqueue(clientPhone, msg, { appointmentId: item.id });
  }

  broadcast({ type: 'APPOINTMENTS_UPDATED', payload: item });
  res.json({ success: true, data: item });
});

app.delete('/api/appointments/:id', (req, res) => {
  const success = db.deleteAppointment(req.params.id);
  broadcast({ type: 'APPOINTMENTS_UPDATED', payload: null });
  res.json({ success });
});

// ==========================================
// 🔑 API KEYS & WEBHOOKS
// ==========================================

app.get('/api/keys', (req, res) => {
  res.json(db.getApiKeys());
});

app.post('/api/keys', (req, res) => {
  const { name } = req.body;
  const key = db.addApiKey({ name });
  res.json({ success: true, data: key });
});

app.delete('/api/keys/:id', (req, res) => {
  const success = db.deleteApiKey(req.params.id);
  res.json({ success });
});

// ==========================================
// 📡 HARDWARE, USSD, CONFIG & LOGS
// ==========================================

app.get('/api/hardware/status', async (req, res) => {
  const status = await goipDriver.getStatus();
  res.json(status);
});

app.post('/api/hardware/discover', async (req, res) => {
  db.addLog('info', '[Auto-Discovery] Starting network scan for DBL GoIP-1...');
  const result = await goipDiscovery.discover();
  if (result.success && result.ip) {
    db.updateConfig({ gatewayIp: result.ip });
    db.addLog('success', `[Auto-Discovery] Discovered GoIP-1 hardware at ${result.ip}`);
  }
  res.json(result);
});

app.post('/api/ussd/send', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command parameter is required' });

  const result = await goipDriver.runUssd(command);
  broadcast({ type: 'USSD_REPLY', payload: result });
  res.json(result);
});

app.get('/api/ussd/logs', (req, res) => {
  res.json(db.getUssdLogs());
});

app.get('/api/config', (req, res) => {
  res.json(db.getConfig());
});

app.post('/api/config', (req, res) => {
  const updated = db.updateConfig(req.body);
  db.addLog('info', 'System configuration updated', updated);
  broadcast({ type: 'CONFIG_UPDATED', payload: updated });
  res.json({ success: true, config: updated });
});

app.get('/api/logs', (req, res) => {
  res.json(db.getLogs());
});

// ==========================================
// 🌐 SERVE PRODUCTION FRONTEND DIRECTORY
// ==========================================
const distPath = path.join(__dirname, '../frontend/dist');

app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Jarvis SMS Gateway API is running.');
  }
});

// Start HTTP + WS Server on 0.0.0.0 (Accessible across entire LAN network)
server.listen(PORT, '0.0.0.0', () => {
  db.addLog('info', `Jarvis GoIP-1 SMS Gateway Server running on port ${PORT}`);
  console.log(`=======================================================`);
  console.log(`⚡ Jarvis SMS Gateway Active (Direct Localhost Mode):`);
  console.log(`🏠 Local URL:   http://localhost:${PORT}`);
  console.log(`🔌 WebSocket:   ws://localhost:${PORT}`);
  console.log(`📡 GoIP Hardware: ${db.getConfig().gatewayIp}`);
  console.log(`🚀 Integration: POST http://localhost:${PORT}/api/v1/gateway/send`);
  console.log(`=======================================================`);
});
