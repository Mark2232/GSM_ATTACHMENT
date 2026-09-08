/**
 * Standalone GSM Gateway, SMS Dispatcher & 3-Stage Appointment Reminder Server
 * Runs completely independently on localhost (Default Port: 3310).
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const gsmRouter = require('./backend/routes/gsm');
const queueEngine = require('./backend/lib/gsm/queueEngine');
const inboundPoller = require('./backend/lib/gsm/inboundPoller');
const appointmentScheduler = require('./backend/lib/gsm/appointmentScheduler');
const db = require('./backend/lib/gsm/database');

const app = express();
const PORT = process.env.GSM_PORT || process.env.PORT || 5176;

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve Web UI Dashboard Static Assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// System Health API Endpoint
app.get('/api/health', (req, res) => {
  const cfg = db.getConfig();
  res.json({
    status: 'online',
    service: 'JARVIS Standalone GSM Gateway & Appointment Reminder System',
    port: PORT,
    uptimeSeconds: Math.floor(process.uptime()),
    phtTime: appointmentScheduler.getPHTNow ? appointmentScheduler.getPHTNow() : new Date().toISOString(),
    hardware: {
      gatewayIp: cfg.gatewayIp,
      simLine: cfg.line,
      useMockGateway: !!cfg.useMockGateway,
      carrier: cfg.carrierName
    }
  });
});

// Mount GSM API Routes
app.use('/api/gsm', gsmRouter);

// Fallback Route for Single Page Application
app.get(['/', '/gsm', '/inbox', '/appointments', '/settings', '/templates', '/logs'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start the Independent Localhost Server & Background Daemons
const server = app.listen(PORT, () => {
  console.log('================================================================');
  console.log('       📡 JARVIS STANDALONE GSM & SMS REMINDER SYSTEM           ');
  console.log('================================================================');
  console.log(`🚀 Web Dashboard UI:  http://localhost:${PORT}`);
  console.log(`🔗 API Base:          http://localhost:${PORT}/api/gsm`);
  console.log(`🩺 Health Endpoint:    http://localhost:${PORT}/api/health`);
  console.log('================================================================');

  // 1. Start Outbound Rate-limited Queue Processor
  try {
    queueEngine.start();
    console.log('✅ [GSM] Outbound Queue Engine active (Anti-Ban Jitter & Throttling).');
  } catch (err) {
    console.error('❌ [GSM] Failed to start Outbound Queue Engine:', err.message);
  }

  // 2. Start Inbound SMS Poller (checks GoIP gateway for incoming SMS)
  try {
    inboundPoller.start(15000); // Poll every 15 seconds
    console.log('✅ [GSM] Inbound SMS Poller active (15s Polling Interval).');
  } catch (err) {
    console.error('❌ [GSM] Failed to start Inbound Poller:', err.message);
  }

  // 3. Start 3-Stage 8:00 AM PHT Appointment Reminder Scheduler
  try {
    appointmentScheduler.start(60000); // Check every 60 seconds
    console.log('✅ [GSM] 3-Stage Appointment Scheduler active (PHT: Asia/Manila, UTC+8).');
  } catch (err) {
    console.error('❌ [GSM] Failed to start Appointment Scheduler:', err.message);
  }
});

module.exports = { app, server };
