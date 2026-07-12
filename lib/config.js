const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 25 * 1024 * 1024;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@blackrococo.mx';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rococo2026';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

// If SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set, `supabase` is null
// and the whole app runs in local single-salon JSON-file mode — no setup
// needed for `npm install && npm start`. Set them to run as real
// multi-tenant SaaS: one deployment, multiple salons, resolved per request.
const supabase = require('./supabaseClient');
const USE_SUPABASE = Boolean(supabase);

const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/Mexico_City';
const BUSINESS_TZ_OFFSET = process.env.BUSINESS_TZ_OFFSET || '-06:00';
const DEFAULT_COUNTRY_DIAL_CODE = process.env.DEFAULT_COUNTRY_DIAL_CODE || '521';
const BOOKING_WEBHOOK_URL = process.env.BOOKING_WEBHOOK_URL || '';
const GOOGLE_CALENDAR_WEBHOOK_URL = process.env.GOOGLE_CALENDAR_WEBHOOK_URL || '';
const WHATSAPP_ADMIN_WEBHOOK_URL = process.env.WHATSAPP_ADMIN_WEBHOOK_URL || '';
const WHATSAPP_ADMIN_PHONE = process.env.WHATSAPP_ADMIN_PHONE || '';
const CLIENT_REMINDER_WEBHOOK_URL = process.env.CLIENT_REMINDER_WEBHOOK_URL || '';
const CLIENT_REMINDER_HOURS = String(process.env.CLIENT_REMINDER_HOURS || '24,2')
  .split(',')
  .map(v => Math.max(1, Number(v.trim()) || 0))
  .filter(Boolean);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const STATUS_FLOW = ['new', 'confirmed', 'in_progress', 'completed'];
const STATUS_LABELS = {
  new: 'NUEVA',
  confirmed: 'CONFIRMADA',
  in_progress: 'EN CURSO',
  completed: 'COMPLETADA',
  cancelled: 'CANCELADA'
};

module.exports = {
  ROOT, PUBLIC_DIR, UPLOAD_DIR, MAX_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES, DB_PATH, PORT,
  ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_TTL_MS,
  supabase, USE_SUPABASE,
  SITE_URL, BUSINESS_TIME_ZONE, BUSINESS_TZ_OFFSET, DEFAULT_COUNTRY_DIAL_CODE,
  BOOKING_WEBHOOK_URL, GOOGLE_CALENDAR_WEBHOOK_URL, WHATSAPP_ADMIN_WEBHOOK_URL,
  WHATSAPP_ADMIN_PHONE, CLIENT_REMINDER_WEBHOOK_URL, CLIENT_REMINDER_HOURS,
  STATUS_FLOW, STATUS_LABELS
};
