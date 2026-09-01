const db = require('./database');
const queueEngine = require('./queueEngine');

class AppointmentScheduler {
  constructor() {
    this.timer = null;
    this.checkIntervalMs = 20000; // Check every 20 seconds
  }

  start() {
    db.addLog('info', 'Appointment Scheduler Service started.');
    this.timer = setInterval(() => this.checkAndTriggerReminders(), this.checkIntervalMs);
    // Initial immediate check
    this.checkAndTriggerReminders();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkAndTriggerReminders() {
    const appointments = db.getAppointments();
    const templates = db.getTemplates();
    const now = Date.now();

    for (const apt of appointments) {
      if (apt.status !== 'SCHEDULED') continue;

      const aptTime = new Date(apt.appointmentTime).getTime();
      const advanceNoticeMs = (apt.advanceNoticeHours || 24) * 3600 * 1000;
      const targetReminderTime = aptTime - advanceNoticeMs;

      // If current time is past or within target reminder window, trigger SMS!
      if (now >= targetReminderTime) {
        db.addLog('info', `[Appointment Trigger] Time reached for client ${apt.clientName} (${apt.clientPhone})`);

        // Find template or default
        const tmpl = templates.find(t => t.id === apt.templateId) || templates[0];
        
        // Variable substitution
        const formattedDate = new Date(apt.appointmentTime).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const formattedTime = new Date(apt.appointmentTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        let smsMessage = tmpl.text
          .replace(/\{\{clientName\}\}/g, apt.clientName)
          .replace(/\{\{serviceName\}\}/g, apt.serviceName || 'Appointment')
          .replace(/\{\{appointmentDate\}\}/g, formattedDate)
          .replace(/\{\{appointmentTime\}\}/g, formattedTime);

        // Enqueue SMS to GoIP-1 Queue Engine
        queueEngine.enqueue(apt.clientPhone, smsMessage, {
          appointmentId: apt.id,
          type: 'AUTOMATED_REMINDER'
        });

        // Update appointment status to REMINDER_SENT
        db.updateAppointmentStatus(apt.id, 'REMINDER_SENT');
        db.addLog('success', `[Auto Notification] Queued advance SMS reminder to ${apt.clientPhone} for appointment at ${formattedDate}`);
      }
    }
  }
}

module.exports = new AppointmentScheduler();
