-- ============================================================================
-- Black Rococo SaaS schema
-- Run this once in Supabase → SQL Editor (on a fresh project).
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE where possible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SALONS (tenants)
-- ----------------------------------------------------------------------------
create table if not exists salons (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- e.g. 'nails', 'makeup' -> subdomain
  name text not null,
  business_type text not null default 'other', -- 'nails' | 'makeup' | 'other'
  brand jsonb not null default '{}'::jsonb,     -- heroTitle, tagline, specialties, etc.
  contact jsonb not null default '{}'::jsonb,   -- address, whatsapp, instagram, hours...
  booking jsonb not null default '{}'::jsonb,   -- times[], confirmNote, etc.
  featured_service_ids jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SALON ADMINS (per-tenant login, replaces the old single global admin)
-- ----------------------------------------------------------------------------
create table if not exists salon_admins (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  email text not null,
  password_hash text not null,   -- format: "<salt_hex>:<hash_hex>" (scrypt)
  created_at timestamptz not null default now(),
  unique (salon_id, email)
);

-- ----------------------------------------------------------------------------
-- CLIENTS (per-salon CRM)
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  instagram text not null default '',
  birthday text not null default '',
  style_choice text not null default '',
  color_choice text not null default '',
  drink_choice text not null default '',
  time_preference text not null default '',
  notes text not null default '',
  allergies text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, whatsapp)
);
create index if not exists idx_clients_salon on clients(salon_id);

-- ----------------------------------------------------------------------------
-- SERVICES
-- ----------------------------------------------------------------------------
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  cat text not null default '',
  name text not null default '',
  description text not null default '',
  price integer not null default 0,
  duration_minutes integer not null default 30,
  image_url text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_services_salon on services(salon_id);

-- ----------------------------------------------------------------------------
-- APPOINTMENTS
-- Partial unique index = real DB-level double-booking protection.
-- ----------------------------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  folio_number bigserial,
  salon_id uuid not null references salons(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  service_name_snapshot text not null default '',
  appt_date date not null,
  appt_time text not null,
  status text not null default 'new', -- new | confirmed | in_progress | completed | cancelled
  preferences_snapshot jsonb not null default '{}'::jsonb,
  final_price integer not null default 0,
  original_price integer not null default 0,
  applied_promotion jsonb,
  reminders_sent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_appt_salon_date on appointments(salon_id, appt_date);
create index if not exists idx_appt_client on appointments(client_id);
-- The actual double-booking guard: only one non-cancelled booking per salon+date+time.
create unique index if not exists uq_appt_slot
  on appointments(salon_id, appt_date, appt_time)
  where status <> 'cancelled';

-- ----------------------------------------------------------------------------
-- PROMOTIONS
-- ----------------------------------------------------------------------------
create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  code text not null default '',
  label text not null default '',
  title text not null default '',
  note text not null default '',
  discount_type text not null default 'percent', -- percent | fixed
  value numeric not null default 0,
  scope text not null default 'all', -- all | category | services
  category_value text not null default '',
  service_ids jsonb not null default '[]'::jsonb,
  start_date date,
  end_date date,
  active boolean not null default true,
  auto_apply boolean not null default true,
  usage_limit integer not null default 0,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_promo_salon on promotions(salon_id);

-- Atomic increment so concurrent bookings can never under/over-count usage.
create or replace function increment_promo_usage(promo_id uuid)
returns void as $$
  update promotions set usage_count = usage_count + 1, updated_at = now() where id = promo_id;
$$ language sql;

-- ----------------------------------------------------------------------------
-- COURSES + REGISTRATIONS
-- ----------------------------------------------------------------------------
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  price integer not null default 0,
  duration text not null default '',
  level text not null default '',
  image_urls jsonb not null default '[]'::jsonb,
  capacity integer not null default 0,
  start_date date,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_courses_salon on courses(salon_id);

create table if not exists course_registrations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  name text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  notes text not null default '',
  status text not null default 'new', -- new | confirmed | cancelled
  created_at timestamptz not null default now()
);
create index if not exists idx_courseregs_salon on course_registrations(salon_id);

-- ----------------------------------------------------------------------------
-- MEDIA LIBRARY (gallery + homepage carousel)
-- ----------------------------------------------------------------------------
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  kind text not null default 'image', -- image | video
  url text not null,
  poster_url text not null default '',
  title text not null default '',
  description text not null default '',
  category text not null default '',
  sort_order integer not null default 0,
  show_in_carousel boolean not null default false,
  show_in_gallery boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_media_salon on media(salon_id);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS (admin panel bell)
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  kind text not null default '',
  channel text not null default 'admin_panel',
  title text not null default '',
  message text not null default '',
  status text not null default 'unread',
  action_label text not null default '',
  action_url text not null default '',
  error text not null default '',
  unread boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notifications_salon on notifications(salon_id, unread);

-- ----------------------------------------------------------------------------
-- POSTS (legacy "publish to social" tracking — kept for continuity)
-- ----------------------------------------------------------------------------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  caption text not null default '',
  image_url text not null default '',
  targets jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now()
);
create index if not exists idx_posts_salon on posts(salon_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- The backend talks to Postgres exclusively with the service_role key, which
-- bypasses RLS by design. Enabling RLS with NO policies for anon/authenticated
-- means that even if a key or JWT ever leaked to a browser, it can read/write
-- nothing. Tenant isolation itself is enforced in application code (every
-- query is filtered by salon_id) — because 100% of access is mediated by
-- your own server, never client-direct-to-Supabase.
-- ============================================================================
alter table salons enable row level security;
alter table salon_admins enable row level security;
alter table clients enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table promotions enable row level security;
alter table courses enable row level security;
alter table course_registrations enable row level security;
alter table media enable row level security;
alter table notifications enable row level security;
alter table posts enable row level security;

-- ============================================================================
-- SEED: two pilot salons (edit names/branding freely afterwards from Admin UI)
-- ============================================================================
insert into salons (slug, name, business_type, brand, contact, booking, featured_service_ids)
values (
  'nails',
  'Black Rococo',
  'nails',
  '{"heroTitle":"Uñas de revista, hechas a tu medida","heroSubtitle":"EDITORIAL NAILS, MADE FOR YOU","specialties":"MANICURE RUSO · POLIGEL","rating":"4.9","socialProof":"+600 clientas felices","footer":"© 2026 BLACK ROCOCO"}'::jsonb,
  '{"whatsappNumber":"33 2655 3522","hours1":"Lun – Sáb · 10:00 – 20:00","hours2":"Domingo cerrado"}'::jsonb,
  '{"times":["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],"confirmNote":"Te esperamos en punto. Cancelaciones con 12h de anticipación por WhatsApp."}'::jsonb,
  '[]'::jsonb
)
on conflict (slug) do nothing;

insert into salons (slug, name, business_type, brand, contact, booking, featured_service_ids)
values (
  'makeup',
  'Studio Makeup Salon',
  'makeup',
  '{"heroTitle":"Maquillaje profesional para cada ocasión","heroSubtitle":"BEAUTY, YOUR WAY","specialties":"MAQUILLAJE SOCIAL · NOVIAS · EDITORIAL","rating":"4.9","socialProof":"+300 clientas felices","footer":"© 2026 Studio Makeup Salon"}'::jsonb,
  '{"whatsappNumber":"33 0000 0000","hours1":"Lun – Sáb · 10:00 – 20:00","hours2":"Domingo cerrado"}'::jsonb,
  '{"times":["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],"confirmNote":"Te esperamos en punto. Cancelaciones con 12h de anticipación por WhatsApp."}'::jsonb,
  '[]'::jsonb
)
on conflict (slug) do nothing;
