# Deploying as a multi-tenant SaaS (2 pilot salons)

This walks through taking the app from "runs on my machine with a JSON file"
to two real salons live on one shared deployment, with real per-salon admin
accounts and genuine database-level double-booking protection.

**Architecture:** one Supabase (Postgres) project, one deployment of this
app. Every request resolves which salon it belongs to (via a subdomain, a
`?salon=slug` query param, or an `X-Salon-Slug` header) and every query is
scoped to that salon's data. Two salons doesn't mean two deployments — it
means two rows in the database, both served by the same running app.

This has been tested end-to-end (tenant isolation, cross-tenant admin
session rejection, atomic double-booking protection, per-salon data
isolation) against a simulated Supabase backend. Live network calls to your
actual Supabase project are the one thing you'll be verifying for the first
time when you follow this guide — the request/response logic itself is
already proven.

---

## Part 1 — Create the Supabase project

1. Go to https://supabase.com, create an account, then **New project**.
2. Once it's provisioned, go to **SQL Editor → New query**, paste the
   entire contents of `sql/schema.sql`, and run it. This creates every
   table (salons, salon_admins, clients, services, appointments,
   promotions, courses, course_registrations, media, notifications, posts),
   the real double-booking constraint, RLS locked to service-role-only
   access, and seeds two starter salon rows: `nails` (Black Rococo) and
   `makeup` (Studio Makeup Salon) — rename/edit these freely afterward.
3. Go to **Project Settings → API** and note down:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** — NOT the `anon` key. The anon key is meant to be
     public/exposed to browsers; the service_role key is secret, bypasses
     Row Level Security, and must never reach a browser or git repo →
     `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **Storage → New bucket**. Name it `media`, mark it **Public**.
   This is where uploaded photos/videos are stored (one folder per salon
   slug inside it).

---

## Part 2 — Seed starter services + admin logins (once, from your machine)

With this repo checked out locally and `npm install` already run:

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ...your-service-role-key..."

# Starter service catalogs for each salon (safe to re-run; only adds, never removes)
node scripts/seed-services.js --slug nails
node scripts/seed-services.js --slug makeup

# Create the real admin login for each salon owner
node scripts/create-admin.js --slug nails  --email owner@blackrococo.mx --password "a-strong-password"
node scripts/create-admin.js --slug makeup --email owner@glowmakeup.mx  --password "a-different-strong-password"
```

Passwords are scrypt-hashed before storage — nothing plaintext ever touches
the database. Send each salon owner their own email/password privately.

Want to add a third salon later, or a different business type? Insert a row
into `salons` yourself (Supabase table editor, or SQL), matching the shape
of the two seeded rows, then run the two commands above with its slug.

---

## Part 3 — Deploy (one service, both salons)

This repo includes `railway.json`, so Railway auto-detects the build/run
config.

1. Push this repo to GitHub.
2. https://railway.app → **New Project → Deploy from GitHub repo** → pick
   this repo.
3. Open the service → **Variables** → add:

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | from Part 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Part 1 |
   | `SUPABASE_STORAGE_BUCKET` | `media` |
   | `SESSION_SECRET` | generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NODE_ENV` | `production` |
   | `SITE_URL` | fill in after your first deploy (see below) |

4. Railway redeploys automatically. Once live, it gives you a URL like
   `https://your-app.up.railway.app` — put that in `SITE_URL` and it'll
   redeploy once more.

That's it — **one deployment now serves both salons**, distinguished at
request time.

---

## Part 4 — Testing checklist per salon

While you don't have a custom domain yet (see Part 5), reach each salon by
appending `?salon=<slug>` to the deployed URL:

- `https://your-app.up.railway.app/?salon=nails`
- `https://your-app.up.railway.app/?salon=makeup`
- Admin panels: same URLs with `#admin` added, e.g.
  `https://your-app.up.railway.app/?salon=nails#admin`

For **each** salon, verify:

- [ ] Homepage loads with that salon's own brand/services (not the other one's)
- [ ] Booking flow works and the appointment shows up in that salon's admin only
- [ ] Admin login works with that salon's own email/password
- [ ] Salon A's admin login does **not** work on salon B's URL, and vice
      versa (this proves real tenant isolation — the server rejects it)
- [ ] Admin → SERVICIOS: add/edit/delete a service
- [ ] Admin → GALERÍA: upload a photo, confirm it appears in the public gallery
- [ ] Try booking the exact same date+time twice in a row on the same
      salon — the second one should be rejected ("Ese horario acaba de
      ocuparse"). This is real Postgres-enforced protection, not just an
      app-level check.

---

## Part 5 — Custom domains + real subdomains (optional, do this once you have a domain)

Once you own a domain (e.g. `yoursite.com`):

1. Add `ROOT_DOMAIN=yoursite.com` to your Railway variables.
2. In Railway → **Settings → Networking → Custom Domain**, add
   `nails.yoursite.com` and `makeup.yoursite.com`, both pointing at the
   same service (Railway supports multiple custom domains on one service).
3. Add the CNAME records your DNS provider needs.
4. From here on, visiting `nails.yoursite.com` resolves to the nails salon
   automatically — no `?salon=` needed anymore (though it still works as a
   fallback/override). Nothing else changes; this is purely additive.

---

## Security notes

- **Never** put the `service_role` key anywhere that reaches a browser. It
  bypasses all database security by design and only belongs in your
  deployment's server-side environment variables.
- Every table has RLS enabled with **no policies granted** — meaning the
  public/anon key has zero access to any of it. Only your server (using
  service_role) can read or write. Don't add anon/authenticated policies to
  these tables unless you deliberately want direct browser-to-Supabase access.
- Admin sessions are signed with `SESSION_SECRET` (HMAC) and carry which
  salon they were issued for — a session for one salon is cryptographically
  rejected on another salon's routes, even if somehow replayed. This was
  verified directly in testing (a nails-salon session correctly gets
  `loggedIn: false` when sent to the makeup salon's `/api/admin/me`).
- Passwords are hashed with scrypt (Node's built-in, no extra dependency)
  before being stored, never in plaintext.
- Back up your Supabase project regularly (point-in-time recovery on paid
  tiers; on the free tier, periodically export your tables yourself).

---

## What's genuinely new here vs. what's still simplified

**Real and tested:** dynamic per-request tenant resolution, real per-salon
admin accounts with hashed passwords and salon-scoped sessions, a
normalized Postgres schema (not a JSON blob) with real foreign keys and
indexes, and — the one that matters most under real concurrent traffic — an
actual database-level unique constraint that makes double-booking a slot
structurally impossible, not just something an app-level check tries to
prevent.

**Still simplified, on purpose, for a 2-salon pilot:**
- No self-service salon signup flow — new salons are onboarded by you,
  running the seed scripts. Fine for a handful of salons you're personally
  bringing on; a real signup flow is a feature to build once you're past
  the pilot stage.
- No per-staff-member roles within a salon — one admin login per salon.
  Multiple staff accounts with different permissions is a real feature to
  design later, not a config change.
- No billing/subscription layer yet — this covers the data and auth
  foundation a billing layer would sit on top of.
