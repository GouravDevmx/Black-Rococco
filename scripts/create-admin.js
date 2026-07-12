#!/usr/bin/env node
/*
  Creates (or updates the password for) an admin login for a specific salon.

  Usage:
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="eyJ...service-role-key..."
    node scripts/create-admin.js --slug black-rococo --email owner@blackrococo.mx --password "a-strong-password"
*/
const { hashPassword } = require('../lib/auth');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = value;
      if (value !== true) i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const slug = args.slug;
  const email = String(args.email || '').toLowerCase();
  const password = args.password;

  if (!slug || !email || !password || typeof password !== 'string') {
    console.error('Usage: node scripts/create-admin.js --slug <slug> --email <email> --password <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();
  if (salonErr) {
    console.error('Failed to look up salon:', salonErr.message);
    process.exit(1);
  }
  if (!salon) {
    console.error(`No salon found with slug "${slug}". Run the schema.sql seed inserts (or add it manually) first.`);
    process.exit(1);
  }

  const password_hash = hashPassword(password);
  const { error } = await supabase
    .from('salon_admins')
    .upsert({ salon_id: salon.id, email, password_hash }, { onConflict: 'salon_id,email' });

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`✅ Admin login ready for "${salon.name}" (${slug}): ${email}`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
