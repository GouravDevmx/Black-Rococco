-- ============================================
-- Property CRM - Migration V2
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================

-- Team Members / Representatives
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  role TEXT DEFAULT 'representative' CHECK (role IN ('admin', 'representative', 'manager')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add representative_id to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS representative_id UUID REFERENCES team_members(id);

-- Add assigned_to for reminders
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team_members(id);

-- Add sent_at to quotes for tracking when quote was sent
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Auto-reminder configuration in company_config
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS auto_reminder_enabled BOOLEAN DEFAULT true;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS auto_reminder_intervals JSONB DEFAULT '[{"days": 1, "channel": "email", "label": "1 day follow-up"}, {"days": 3, "channel": "whatsapp", "label": "3 day follow-up"}, {"days": 7, "channel": "email", "label": "7 day follow-up"}]';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT '';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS smtp_user TEXT DEFAULT '';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS smtp_pass TEXT DEFAULT '';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS smtp_from_email TEXT DEFAULT '';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS smtp_from_name TEXT DEFAULT '';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS email_quote_subject TEXT DEFAULT 'Your Property Quote - {{quote_number}}';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS email_quote_body TEXT DEFAULT 'Dear {{contact_name}},\n\nPlease find attached your quotation {{quote_number}} for {{property_name}}.\n\nCheck-in: {{check_in}}\nCheck-out: {{check_out}}\nTotal: {{currency}} {{total}}\n\nThis quote is valid until {{valid_until}}.\n\nPlease do not hesitate to contact us if you have any questions.\n\nBest regards,\n{{company_name}}';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS whatsapp_quote_template TEXT DEFAULT 'Hi {{contact_name}}, your quote {{quote_number}} for {{property_name}} ({{check_in}} to {{check_out}}) is ready. Total: {{currency}} {{total}}. Valid until {{valid_until}}.';
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS whatsapp_reminder_template TEXT DEFAULT 'Hi {{contact_name}}, just a reminder about your quote {{quote_number}} for {{property_name}}. Total: {{currency}} {{total}}. Let us know if you have any questions!';

-- Scheduled notifications table
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  reminder_id UUID REFERENCES reminders(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'both')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMPTZ,
  error_message TEXT DEFAULT '',
  template_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_representative ON clients(representative_id);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned ON reminders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status ON scheduled_notifications(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled ON scheduled_notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_due_completed ON reminders(due_date, is_completed);

-- Update trigger for team_members
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
