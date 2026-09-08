const goipDriver = require('./goipDriver');
const db = require('./database');
const smartAutoReply = require('./smartAutoReply');

class InboundPoller {
  constructor() {
    this.interval = null;
    this.isPolling = false;
    this.processedSignatures = new Set();
  }

  /**
   * Generates a unique signature for a message to prevent duplicate processing.
   */
  getMessageSignature(from, time, message) {
    const cleanPhone = String(from || '').replace(/[^0-9]/g, '').slice(-10);
    const cleanMsg = String(message || '').trim().toLowerCase().slice(0, 30);
    const cleanTime = String(time || '').trim();
    return `${cleanPhone}_${cleanTime}_${cleanMsg}`;
  }

  /**
   * Fetches hardware SMS from GoIP device, saves new messages, and triggers smart auto-replies.
   */
  async syncHardwareInbox() {
    if (this.isPolling) return { synced: 0 };
    this.isPolling = true;

    let newCount = 0;
    const syncedMessages = [];

    try {
      const hwMessages = await goipDriver.fetchHardwareInbox(1);
      const existingInbound = db.getInboundMessages();

      // Seed processed signatures from existing database records
      for (const ex of existingInbound) {
        this.processedSignatures.add(this.getMessageSignature(ex.from, ex.receivedAt, ex.message));
        if (ex.raw && ex.raw.time) {
          this.processedSignatures.add(this.getMessageSignature(ex.from, ex.raw.time, ex.message));
        }
      }

      for (const msg of hwMessages) {
        const sig = this.getMessageSignature(msg.from, msg.time, msg.message);
        if (this.processedSignatures.has(sig)) {
          continue;
        }

        // Also verify against existing database by exact phone + message similarity
        const alreadyExists = existingInbound.some(ex => {
          const p1 = String(ex.from || '').replace(/[^0-9]/g, '').slice(-10);
          const p2 = String(msg.from || '').replace(/[^0-9]/g, '').slice(-10);
          const m1 = String(ex.message || '').trim().toLowerCase();
          const m2 = String(msg.message || '').trim().toLowerCase();
          return p1 === p2 && (m1 === m2 || m1.includes(m2) || m2.includes(m1));
        });

        if (alreadyExists) {
          this.processedSignatures.add(sig);
          continue;
        }

        console.log(`[InboundPoller] 📥 New hardware SMS received from ${msg.from}: "${msg.message}"`);
        this.processedSignatures.add(sig);

        // 🤖 Process through Smart Auto-Reply Engine
        let autoReplyResult = null;
        try {
          autoReplyResult = await smartAutoReply.processInboundMessage({
            from: msg.from,
            message: msg.message,
            line: msg.line || 1,
            autoSend: true
          });
        } catch (autoErr) {
          console.error('[InboundPoller Smart Auto-Reply Error]', autoErr.message);
        }

        const saved = db.addInboundMessage({
          from: msg.from,
          message: msg.message,
          line: msg.line || 1,
          time: new Date().toISOString(),
          raw: {
            hwTime: msg.time,
            from: msg.from,
            message: msg.message
          },
          autoReply: autoReplyResult ? {
            enabled: autoReplyResult.autoReplyEnabled,
            customerFound: autoReplyResult.customerFound,
            matchedCustomer: autoReplyResult.customer,
            intent: autoReplyResult.intent,
            thought: autoReplyResult.thought,
            reasoning: autoReplyResult.reasoning,
            replyText: autoReplyResult.replyText,
            dispatchResult: autoReplyResult.dispatchResult
          } : null
        });

        newCount++;
        syncedMessages.push(saved);
      }
    } catch (err) {
      console.warn('[InboundPoller Error]', err.message);
    } finally {
      this.isPolling = false;
    }

    return {
      synced: newCount,
      messages: syncedMessages
    };
  }

  /**
   * Starts periodic polling every 4 seconds.
   */
  start(intervalMs = 4000) {
    if (this.interval) clearInterval(this.interval);
    this.syncHardwareInbox(); // immediate initial sync
    this.interval = setInterval(() => {
      this.syncHardwareInbox();
    }, intervalMs);
    console.log(`📡 [GSM Inbound Poller] Active — Polling GoIP hardware SMS inbox every ${intervalMs / 1000}s`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = new InboundPoller();
