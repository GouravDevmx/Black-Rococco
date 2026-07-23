const nodemailer = require('nodemailer');
const axios = require('axios');
const supabase = require('./supabase');

class NotificationService {

  // Replace template variables like {{contact_name}} with actual values
  static fillTemplate(template, data) {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  }

  // Build template data from quote + related records
  static async buildTemplateData(quote, config) {
    const data = {
      quote_number: quote.quote_number || '',
      check_in: quote.check_in ? new Date(quote.check_in).toLocaleDateString() : '',
      check_out: quote.check_out ? new Date(quote.check_out).toLocaleDateString() : '',
      nights: quote.nights || 0,
      guests: quote.guests || 1,
      total: parseFloat(quote.total || 0).toFixed(2),
      currency: quote.currency || 'USD',
      valid_until: quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : '',
      company_name: config?.company_name || '',
      company_email: config?.company_email || '',
      company_phone: config?.company_phone || '',
    };

    // Get property name
    if (quote.property_id) {
      const { data: prop } = await supabase.from('properties').select('name').eq('id', quote.property_id).single();
      data.property_name = prop?.name || '';
    }

    // Get contact name
    if (quote.contact_id) {
      const { data: contact } = await supabase.from('contacts').select('first_name, last_name, email, phone, whatsapp').eq('id', quote.contact_id).single();
      if (contact) {
        data.contact_name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
        data.contact_email = contact.email || '';
        data.contact_phone = contact.phone || '';
        data.contact_whatsapp = contact.whatsapp || contact.phone || '';
      }
    }

    // Get client name
    if (quote.client_id) {
      const { data: client } = await supabase.from('clients').select('company_name').eq('id', quote.client_id).single();
      data.client_name = client?.company_name || '';
    }

    return data;
  }

  // Send email using SMTP
  static async sendEmail(config, to, subject, body, pdfBuffer = null) {
    if (!config.smtp_host || !config.smtp_user) {
      console.log('SMTP not configured, skipping email');
      return { success: false, error: 'SMTP not configured' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port || 587,
        secure: config.smtp_port === 465,
        auth: {
          user: config.smtp_user,
          pass: config.smtp_pass,
        },
      });

      const mailOptions = {
        from: config.smtp_from_name
          ? `"${config.smtp_from_name}" <${config.smtp_from_email || config.smtp_user}>`
          : config.smtp_from_email || config.smtp_user,
        to,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
      };

      if (pdfBuffer) {
        mailOptions.attachments = [{
          filename: `Quote-${subject.match(/QT-[\w-]+/) || 'document'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }];
      }

      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error('Email send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send WhatsApp message via Meta Business API
  static async sendWhatsApp(config, to, message) {
    if (!config.whatsapp_api_key || !config.whatsapp_phone_number) {
      console.log('WhatsApp not configured, skipping');
      return { success: false, error: 'WhatsApp not configured' };
    }

    try {
      // Clean phone number
      const phone = to.replace(/[^0-9+]/g, '').replace(/^\+/, '');

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${config.whatsapp_phone_number}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            'Authorization': `Bearer ${config.whatsapp_api_key}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return { success: true, messageId: response.data?.messages?.[0]?.id };
    } catch (error) {
      console.error('WhatsApp send error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  // Create auto-reminders when a quote is sent
  static async createAutoReminders(quoteId) {
    try {
      const { data: config } = await supabase.from('company_config').select('*').single();
      if (!config?.auto_reminder_enabled) return;

      const { data: quote } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
      if (!quote) return;

      const intervals = config.auto_reminder_intervals || [];
      const templateData = await this.buildTemplateData(quote, config);

      const reminders = [];
      const notifications = [];

      for (const interval of intervals) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + interval.days);

        // Create reminder
        const reminderData = {
          quote_id: quoteId,
          client_id: quote.client_id,
          title: `Follow up: ${quote.quote_number} — ${interval.label}`,
          description: `Auto-reminder for quote ${quote.quote_number}`,
          due_date: dueDate.toISOString(),
          reminder_type: 'follow_up',
          notify_email: interval.channel === 'email' || interval.channel === 'both',
          notify_whatsapp: interval.channel === 'whatsapp' || interval.channel === 'both',
        };

        const { data: reminder, error } = await supabase
          .from('reminders').insert(reminderData).select().single();

        if (error) {
          console.error('Auto-reminder creation error:', error);
          continue;
        }

        reminders.push(reminder);

        // Schedule notification
        notifications.push({
          quote_id: quoteId,
          client_id: quote.client_id,
          contact_id: quote.contact_id,
          reminder_id: reminder.id,
          channel: interval.channel || 'email',
          scheduled_for: dueDate.toISOString(),
          status: 'pending',
          template_data: templateData,
        });
      }

      if (notifications.length > 0) {
        await supabase.from('scheduled_notifications').insert(notifications);
      }

      // Log
      await supabase.from('activity_log').insert({
        entity_type: 'quote',
        entity_id: quoteId,
        action: 'auto_reminders_created',
        details: { count: reminders.length },
      });

      return reminders;
    } catch (error) {
      console.error('Auto-reminder error:', error);
    }
  }

  // Process pending notifications (called by cron/scheduler)
  static async processPendingNotifications() {
    try {
      const now = new Date().toISOString();
      const { data: pending } = await supabase
        .from('scheduled_notifications')
        .select('*, quotes(*), contacts(*)')
        .eq('status', 'pending')
        .lte('scheduled_for', now)
        .limit(50);

      if (!pending || pending.length === 0) return;

      const { data: config } = await supabase.from('company_config').select('*').single();

      for (const notif of pending) {
        const templateData = notif.template_data || {};
        let result = { success: false };

        if (notif.channel === 'email' || notif.channel === 'both') {
          const subject = NotificationService.fillTemplate(
            config.email_quote_subject || 'Follow up - {{quote_number}}',
            templateData
          );
          const body = NotificationService.fillTemplate(
            config.email_quote_body || 'Reminder about quote {{quote_number}}',
            templateData
          );
          const to = templateData.contact_email;
          if (to) {
            result = await NotificationService.sendEmail(config, to, subject, body);
          }
        }

        if (notif.channel === 'whatsapp' || notif.channel === 'both') {
          const message = NotificationService.fillTemplate(
            config.whatsapp_reminder_template || 'Reminder about {{quote_number}}',
            templateData
          );
          const to = templateData.contact_whatsapp || templateData.contact_phone;
          if (to) {
            result = await NotificationService.sendWhatsApp(config, to, message);
          }
        }

        // Update notification status
        await supabase.from('scheduled_notifications').update({
          status: result.success ? 'sent' : 'failed',
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || '',
        }).eq('id', notif.id);

        // Mark reminder as completed if notification sent
        if (result.success && notif.reminder_id) {
          await supabase.from('reminders').update({
            is_completed: true,
            completed_at: new Date().toISOString(),
          }).eq('id', notif.reminder_id);
        }
      }
    } catch (error) {
      console.error('Notification processing error:', error);
    }
  }
}

module.exports = NotificationService;
