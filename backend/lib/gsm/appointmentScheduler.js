const db = require('./database');
const goipDriver = require('./goipDriver');

class AppointmentScheduler {
  constructor() {
    this.timer = null;
    this.isChecking = false;
    this.lastCheckTimestamp = null;
    this.lastCheckResult = {
      checkedAt: null,
      processedCount: 0,
      remindersSent: []
    };
  }

  /**
   * Returns current time and date in Philippine Time (Asia/Manila, UTC+8)
   */
  getPHTNow() {
    const now = new Date();
    // Use Intl for precise timezone formatting
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const dateStr = dateFormatter.format(now); // "YYYY-MM-DD"
    const timeStr = timeFormatter.format(now); // "HH:MM:SS"
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);

    return {
      dateStr,
      timeStr,
      hours,
      minutes,
      seconds,
      timestamp: now.toISOString()
    };
  }

  /**
   * Helper to calculate difference in calendar days between two YYYY-MM-DD strings in PHT.
   * Positive number means targetDate is in the future.
   */
  getDaysDifference(currentDateStr, targetDateStr) {
    const d1 = new Date(`${currentDateStr}T00:00:00+08:00`);
    const d2 = new Date(`${targetDateStr}T00:00:00+08:00`);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Formats message template with appointment placeholders
   */
  renderTemplate(template, appt) {
    if (!template) return '';
    return template
      .replace(/\{\{\s*name\s*\}\}/gi, appt.clientName || 'Valued Client')
      .replace(/\{\{\s*serviceType\s*\}\}/gi, appt.serviceType || 'Consultation & Service')
      .replace(/\{\{\s*date\s*\}\}/gi, appt.date || '')
      .replace(/\{\{\s*time\s*\}\}/gi, appt.time || '')
      .replace(/\{\{\s*notes\s*\}\}/gi, appt.notes || '');
  }

  /**
   * Sends an SMS reminder for a specific stage and logs it
   */
  async dispatchReminder(appt, stage, customText = null) {
    const templates = db.getAppointmentReminderTemplates();
    let messageContent = customText;

    if (!messageContent) {
      if (stage === '3days') {
        messageContent = this.renderTemplate(templates.threeDays, appt);
      } else if (stage === '24hours') {
        messageContent = this.renderTemplate(templates.twentyFourHours, appt);
      } else if (stage === 'dayof') {
        messageContent = this.renderTemplate(templates.dayOf8Am, appt);
      } else {
        messageContent = `Hello ${appt.clientName}! This is a reminder for your upcoming appointment for "${appt.serviceType}" at JARVIS on ${appt.date} at ${appt.time}.`;
      }
    }

    const msgId = `msg_appt_${stage}_${Date.now()}`;
    const config = db.getConfig();
    const line = config.line || 1;

    try {
      await goipDriver.sendSms(line, appt.clientPhone, messageContent);

      const logEntry = {
        id: msgId,
        recipient: appt.clientPhone,
        message: messageContent,
        status: 'SENT',
        createdAt: new Date().toISOString(),
        metadata: {
          appointmentId: appt.id,
          clientName: appt.clientName,
          reminderStage: stage
        }
      };

      db.addMessage(logEntry);
      db.addLog('info', `[3-Stage Reminder] Sent ${stage} reminder to ${appt.clientName} (${appt.clientPhone})`);

      // Update appointment reminder tracking
      db.updateAppointmentReminderStatus(appt.id, stage, {
        sent: true,
        sentAt: new Date().toISOString(),
        msgId,
        status: 'DELIVERED'
      });

      return { success: true, msgId, message: messageContent };
    } catch (err) {
      db.addLog('error', `[3-Stage Reminder Failed] Could not send ${stage} reminder to ${appt.clientPhone}: ${err.message}`);
      
      db.updateAppointmentReminderStatus(appt.id, stage, {
        sent: false,
        lastError: err.message,
        attemptedAt: new Date().toISOString(),
        status: 'FAILED'
      });

      throw err;
    }
  }

  /**
   * Main scan function: evaluates all scheduled appointments against PHT time
   */
  async checkAndDispatchReminders() {
    if (this.isChecking) return this.lastCheckResult;
    this.isChecking = true;

    const pht = this.getPHTNow();
    this.lastCheckTimestamp = pht.timestamp;

    const sentThisRun = [];
    const appointments = db.getAppointments();
    const activeAppts = appointments.filter(a => a.status === 'SCHEDULED' && a.sendAutoReminder !== false);

    for (const appt of activeAppts) {
      if (!appt.date || !appt.clientPhone) continue;

      const daysDiff = this.getDaysDifference(pht.dateStr, appt.date);
      const reminders = appt.reminders || {};

      // Stage 1: 3 Days Before (daysDiff === 3, or if current time is on/after 8:00 AM PHT 3 days prior)
      if (daysDiff === 3 && pht.hours >= 8 && (!reminders.threeDays || !reminders.threeDays.sent)) {
        try {
          const res = await this.dispatchReminder(appt, '3days');
          sentThisRun.push({ apptId: appt.id, client: appt.clientName, stage: '3days', ...res });
        } catch (e) {
          console.warn(`[AppointmentScheduler] Error sending 3-day reminder for appt ${appt.id}:`, e.message);
        }
      }

      // Stage 2: 24 Hours / 1 Day Before (daysDiff === 1, on/after 8:00 AM PHT)
      if (daysDiff === 1 && pht.hours >= 8 && (!reminders.twentyFourHours || !reminders.twentyFourHours.sent)) {
        try {
          const res = await this.dispatchReminder(appt, '24hours');
          sentThisRun.push({ apptId: appt.id, client: appt.clientName, stage: '24hours', ...res });
        } catch (e) {
          console.warn(`[AppointmentScheduler] Error sending 24h reminder for appt ${appt.id}:`, e.message);
        }
      }

      // Stage 3: Appointment Day at 8:00 AM Philippine Time (daysDiff === 0, on/after 8:00 AM PHT)
      if (daysDiff === 0 && pht.hours >= 8 && (!reminders.dayOf || !reminders.dayOf.sent)) {
        try {
          const res = await this.dispatchReminder(appt, 'dayof');
          sentThisRun.push({ apptId: appt.id, client: appt.clientName, stage: 'dayof', ...res });
        } catch (e) {
          console.warn(`[AppointmentScheduler] Error sending Day-Of reminder for appt ${appt.id}:`, e.message);
        }
      }
    }

    this.lastCheckResult = {
      checkedAt: pht.timestamp,
      phtDate: pht.dateStr,
      phtTime: pht.timeStr,
      processedCount: activeAppts.length,
      remindersSent: sentThisRun
    };

    this.isChecking = false;
    return this.lastCheckResult;
  }

  /**
   * Starts periodic scheduler (default: check every 60 seconds)
   */
  start(intervalMs = 60000) {
    if (this.timer) clearInterval(this.timer);
    // Initial check
    this.checkAndDispatchReminders();
    this.timer = setInterval(() => {
      this.checkAndDispatchReminders();
    }, intervalMs);
    console.log(`⏰ [GSM Appointment Scheduler] Active — Checking 3-Stage reminders every ${intervalMs / 1000}s (PHT: Asia/Manila)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus() {
    const pht = this.getPHTNow();
    return {
      active: !!this.timer,
      isChecking: this.isChecking,
      phtCurrentDate: pht.dateStr,
      phtCurrentTime: pht.timeStr,
      timezone: 'Asia/Manila (UTC+8)',
      lastCheckResult: this.lastCheckResult
    };
  }
}

module.exports = new AppointmentScheduler();
