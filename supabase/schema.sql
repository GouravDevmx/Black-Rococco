-- ============================================
-- Property CRM - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Company Configuration & PDF Settings
CREATE TABLE company_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'My Property Company',
  company_email TEXT DEFAULT '',
  company_phone TEXT DEFAULT '',
  company_website TEXT DEFAULT '',
  company_address TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  
  -- PDF Layout Settings
  pdf_primary_color TEXT DEFAULT '#1a365d',
  pdf_secondary_color TEXT DEFAULT '#2d3748',
  pdf_accent_color TEXT DEFAULT '#3182ce',
  pdf_font_family TEXT DEFAULT 'Helvetica',
  pdf_logo_position TEXT DEFAULT 'left' CHECK (pdf_logo_position IN ('left', 'center', 'right')),
  pdf_logo_width INTEGER DEFAULT 150,
  pdf_show_header_line BOOLEAN DEFAULT true,
  pdf_show_footer BOOLEAN DEFAULT true,
  pdf_footer_text TEXT DEFAULT 'Thank you for choosing us. We look forward to hosting you.',
  pdf_terms_conditions TEXT DEFAULT 'Payment is due within 7 days of quote acceptance. Prices are subject to availability. Cancellation policy applies as per our terms of service.',
  pdf_payment_instructions TEXT DEFAULT '',
  pdf_quote_validity_days INTEGER DEFAULT 14,
  pdf_page_size TEXT DEFAULT 'A4' CHECK (pdf_page_size IN ('A4', 'Letter')),
  pdf_show_property_image BOOLEAN DEFAULT true,
  pdf_show_amenities BOOLEAN DEFAULT true,
  
  -- Hostaway API Config
  hostaway_api_key TEXT DEFAULT '',
  hostaway_account_id TEXT DEFAULT '',
  
  -- WhatsApp Config
  whatsapp_api_key TEXT DEFAULT '',
  whatsapp_phone_number TEXT DEFAULT '',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Properties (synced from Hostaway)
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostaway_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  property_type TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  zipcode TEXT DEFAULT '',
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  bedrooms INTEGER DEFAULT 0,
  bathrooms INTEGER DEFAULT 0,
  max_guests INTEGER DEFAULT 1,
  base_price DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  cleaning_fee DECIMAL(10,2) DEFAULT 0,
  thumbnail_url TEXT DEFAULT '',
  images JSONB DEFAULT '[]',
  amenities JSONB DEFAULT '[]',
  check_in_time TEXT DEFAULT '15:00',
  check_out_time TEXT DEFAULT '11:00',
  house_rules TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRM Clients (Business Companies)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  industry TEXT DEFAULT '',
  billing_address TEXT DEFAULT '',
  tax_id TEXT DEFAULT '',
  website TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  referral_source TEXT DEFAULT '' CHECK (referral_source IN ('', 'direct', 'referral', 'corporate', 'agent', 'online', 'repeat')),
  referred_by UUID REFERENCES clients(id),
  referral_code TEXT UNIQUE,
  negotiated_discount DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts (People within Client Companies)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  position TEXT DEFAULT '',
  is_primary BOOLEAN DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discount Codes (must be before quotes so FK works)
CREATE TABLE discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_nights INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,
  valid_from DATE,
  valid_until DATE,
  applicable_properties JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  property_id UUID REFERENCES properties(id),
  
  -- Booking Details
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INTEGER DEFAULT 1,
  nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  
  -- Pricing
  nightly_rate DECIMAL(10,2) NOT NULL,
  cleaning_fee DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) DEFAULT 0,
  discount_type TEXT DEFAULT 'none' CHECK (discount_type IN ('none', 'percentage', 'fixed')),
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_code_id UUID REFERENCES discount_codes(id),
  discount_amount DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  
  -- Additional Line Items stored as JSON
  extra_charges JSONB DEFAULT '[]',
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  valid_until DATE,
  notes TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  
  -- PDF
  pdf_url TEXT DEFAULT '',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TIMESTAMPTZ NOT NULL,
  reminder_type TEXT DEFAULT 'follow_up' CHECK (reminder_type IN ('follow_up', 'quote_expiry', 'check_in', 'check_out', 'renewal', 'custom')),
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  notify_whatsapp BOOLEAN DEFAULT false,
  notify_email BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote Number Sequence
CREATE SEQUENCE quote_number_seq START 1001;

-- Function to generate quote numbers
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := 'QT-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('quote_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_company_config_updated_at BEFORE UPDATE ON company_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_discount_codes_updated_at BEFORE UPDATE ON discount_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default company config row
INSERT INTO company_config (company_name) VALUES ('My Property Company');

-- Enable Row Level Security (optional - configure based on your auth setup)
-- ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
-- etc.

-- Indexes for performance
CREATE INDEX idx_properties_hostaway_id ON properties(hostaway_id);
CREATE INDEX idx_properties_is_active ON properties(is_active);
CREATE INDEX idx_clients_company_name ON clients(company_name);
CREATE INDEX idx_clients_referral_code ON clients(referral_code);
CREATE INDEX idx_quotes_client_id ON quotes(client_id);
CREATE INDEX idx_quotes_property_id ON quotes(property_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_quote_number ON quotes(quote_number);
CREATE INDEX idx_discount_codes_code ON discount_codes(code);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_is_completed ON reminders(is_completed);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
