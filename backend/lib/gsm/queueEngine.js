const db = require('./database');
const goipDriver = require('./goipDriver');

class QueueEngine {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.isPaused = false;
    this.broadcastCallback = null;
    this.stats = {
      sentCount: 0,
      failedCount: 0,
      busyRetryCount: 0
    };
  }

  start() {
    this.isPaused = false;
    if (!this.isProcessing && this.queue.length > 0) {
      this.processQueue();
    }
    return true;
  }

  setBroadcaster(cb) {
    this.broadcastCallback = cb;
  }

  notifyUpdate(event, data) {
    if (this.broadcastCallback) {
      this.broadcastCallback({
        event,
        data,
        queueLength: this.queue.length,
        isProcessing: this.isProcessing,
        isPaused: this.isPaused,
        stats: this.stats
      });
    }
  }

  enqueue(recipient, message, metadata = {}) {
    const item = {
      id: 'sms_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      recipient,
      message,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata
    };

    this.queue.push(item);
    db.addMessage(item);
    db.addLog('info', `Queued SMS for ${recipient} (${metadata.recipientName || 'Client'})`);

    this.notifyUpdate('SMS_QUEUED', item);

    if (!this.isProcessing && !this.isPaused) {
      this.processQueue();
    }

    return item;
  }

  enqueueBulk(recipients, message) {
    return recipients.map(r => {
      let targetPhone = '';
      let targetName = 'Valued Customer';
      if (typeof r === 'object' && r !== null) {
        targetPhone = r.phone || r.recipient || '';
        targetName = r.name || r.accountName || 'Valued Customer';
      } else {
        targetPhone = String(r);
      }
      if (!targetPhone) return null;
      const personalizedMsg = message.replace(/\{\{\s*name\s*\}\}/gi, targetName);
      return this.enqueue(targetPhone, personalizedMsg, { recipientName: targetName });
    }).filter(Boolean);
  }

  pause() {
    this.isPaused = true;
    db.addLog('warning', 'SMS Queue processing paused.');
    this.notifyUpdate('QUEUE_PAUSED', null);
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    db.addLog('info', 'SMS Queue processing resumed.');
    this.notifyUpdate('QUEUE_RESUMED', null);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  cancelItem(id) {
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      db.updateMessageStatus(id, 'CANCELLED');
      db.addLog('warning', `Cancelled SMS item ${id}`);
      this.notifyUpdate('SMS_CANCELLED', removed);
      return true;
    }
    return false;
  }

  clearQueue() {
    const count = this.queue.length;
    this.queue.forEach(item => {
      db.updateMessageStatus(item.id, 'CANCELLED');
    });
    this.queue = [];
    db.addLog('warning', `Cleared ${count} items from queue`);
    this.notifyUpdate('QUEUE_CLEARED', { count });
  }

  getSnapshot() {
    return {
      queue: this.queue,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      stats: this.stats
    };
  }

  // Calculate Randomized Jitter Delay (Anti-SIM Block)
  calculateJitterDelay(config) {
    if (!config.enableJitter) return 1000;
    const min = config.minDelaySec || 5;
    const max = config.maxDelaySec || 10;
    const delaySec = Math.floor(Math.random() * (max - min + 1)) + min;
    return delaySec * 1000;
  }

  async processQueue() {
    if (this.isProcessing || this.isPaused || this.queue.length === 0) return;

    this.isProcessing = true;
    const config = db.getConfig();

    while (this.queue.length > 0 && !this.isPaused) {
      const current = this.queue[0];
      current.status = 'SENDING';
      current.attempts += 1;
      current.updatedAt = new Date().toISOString();
      db.updateMessageStatus(current.id, 'SENDING');
      this.notifyUpdate('SMS_SENDING', current);

      try {
        const result = await goipDriver.sendSms(config.line || 1, current.recipient, current.message);
        
        // Success
        current.status = 'SENT';
        current.updatedAt = new Date().toISOString();
        current.response = result;
        this.stats.sentCount += 1;
        
        db.updateMessageStatus(current.id, 'SENT');
        db.addLog('success', `SMS sent successfully to ${current.recipient}`);
        
        this.queue.shift(); // Remove from queue
        this.notifyUpdate('SMS_SENT', current);

      } catch (err) {
        if (err.message === 'GATEWAY_BUSY' && current.attempts < current.maxAttempts) {
          current.status = 'RETRYING';
          this.stats.busyRetryCount += 1;
          db.addLog('warning', `GoIP Line Busy. Retrying ${current.recipient} in 8s (Attempt ${current.attempts}/${current.maxAttempts})`);
          this.notifyUpdate('SMS_RETRYING', current);
          await new Promise(r => setTimeout(r, 8000));
          continue;
        } else {
          current.status = 'FAILED';
          current.error = err.message;
          this.stats.failedCount += 1;
          db.updateMessageStatus(current.id, 'FAILED', err.message);
          db.addLog('error', `Failed sending SMS to ${current.recipient}: ${err.message}`);
          this.queue.shift();
          this.notifyUpdate('SMS_FAILED', current);
        }
      }

      // Jitter delay between messages
      if (this.queue.length > 0 && !this.isPaused) {
        const delayMs = this.calculateJitterDelay(config);
        db.addLog('info', `[Jitter Engine] Waiting ${(delayMs/1000).toFixed(1)}s before next dispatch...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    this.isProcessing = false;
    this.notifyUpdate('QUEUE_IDLE', null);
  }
}

module.exports = new QueueEngine();
