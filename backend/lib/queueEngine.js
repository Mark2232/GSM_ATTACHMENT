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
      status: 'QUEUED', // 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'RETRYING'
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata
    };

    this.queue.push(item);
    db.addMessage(item);
    db.addLog('info', `Queued SMS for ${recipient} (ID: ${item.id})`);

    this.notifyUpdate('SMS_QUEUED', item);

    if (!this.isProcessing && !this.isPaused) {
      this.processQueue();
    }

    return item;
  }

  enqueueBulk(recipients, message) {
    const items = recipients.map(r => this.enqueue(r, message));
    return items;
  }

  pause() {
    this.isPaused = true;
    db.addLog('warning', 'SMS Queue processing paused by user.');
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

  async processQueue() {
    if (this.isProcessing || this.isPaused || this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const config = db.getConfig();

    while (this.queue.length > 0 && !this.isPaused) {
      const item = this.queue[0];
      item.status = 'SENDING';
      item.attempts += 1;
      item.updatedAt = new Date().toISOString();
      db.updateMessageStatus(item.id, 'SENDING', null, { attempts: item.attempts });

      this.notifyUpdate('SMS_SENDING', item);
      db.addLog('info', `[Attempt ${item.attempts}/${item.maxAttempts}] Dispatching to ${item.recipient}...`);

      const result = await goipDriver.dispatchSms(item.recipient, item.message);

      if (result.success) {
        // Successful dispatch to GoIP line
        item.status = 'SENT';
        item.rawResponse = result.rawResponse;
        item.updatedAt = new Date().toISOString();
        db.updateMessageStatus(item.id, 'SENT', null, { rawResponse: result.rawResponse });

        this.stats.sentCount++;
        db.addLog('success', `[SUCCESS] SMS accepted by GoIP for ${item.recipient}`);
        this.notifyUpdate('SMS_SENT', item);
        this.queue.shift(); // Remove from queue
      } else if (result.code === 'GATEWAY_BUSY') {
        this.stats.busyRetryCount++;
        db.addLog('warning', `[BUSY] GoIP Line busy. Waiting before retry for ${item.recipient}`);

        if (item.attempts < item.maxAttempts) {
          item.status = 'RETRYING';
          db.updateMessageStatus(item.id, 'RETRYING', 'Gateway busy, retrying');
          this.notifyUpdate('SMS_RETRYING', item);
          // Wait 4 seconds for line clear
          await new Promise(res => setTimeout(res, 4000));
          continue; // Loop back and retry same item
        } else {
          item.status = 'FAILED';
          item.error = 'Max retries reached: Gateway Busy';
          db.updateMessageStatus(item.id, 'FAILED', item.error);
          this.stats.failedCount++;
          this.notifyUpdate('SMS_FAILED', item);
          this.queue.shift();
        }
      } else {
        // Gateway error or timeout
        item.status = 'FAILED';
        item.error = result.message || 'Dispatch error';
        db.updateMessageStatus(item.id, 'FAILED', item.error);
        this.stats.failedCount++;
        db.addLog('error', `[FAILED] ${item.recipient}: ${item.error}`);
        this.notifyUpdate('SMS_FAILED', item);
        this.queue.shift();
      }

      // If queue still has items, enforce anti-SIM block delay + randomized jitter!
      if (this.queue.length > 0 && !this.isPaused) {
        const minDelay = (config.minDelaySec || 5) * 1000;
        const maxDelay = (config.maxDelaySec || 10) * 1000;
        const jitter = config.enableJitter ? Math.floor(Math.random() * (maxDelay - minDelay)) : 0;
        const totalWaitMs = minDelay + jitter;

        db.addLog('info', `[Anti-SIM Block] Delaying next dispatch by ${(totalWaitMs / 1000).toFixed(1)}s`);
        this.notifyUpdate('QUEUE_WAITING', { waitMs: totalWaitMs });
        await new Promise(res => setTimeout(res, totalWaitMs));
      }
    }

    this.isProcessing = false;
    this.notifyUpdate('QUEUE_IDLE', null);
  }

  getSnapshot() {
    return {
      queue: this.queue,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      stats: this.stats
    };
  }
}

module.exports = new QueueEngine();
