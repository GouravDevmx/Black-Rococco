# Property CRM — Quote Builder & Management System

A full-stack Property CRM for managing Hostaway listings, building branded PDF quotes, tracking clients, and managing discount codes.

## Features

- **Property Sync** — Pull all listings from Hostaway API automatically
- **Quote Builder** — Select property → set dates → apply pricing/discounts → generate branded PDF
- **Mini CRM** — Manage business clients, contacts, referral codes, and negotiated rates
- **Discount Codes** — Create reusable codes (percentage or fixed), with limits and expiry
- **PDF Generator** — Fully configurable branded quotes with logo, colors, and layout options
- **Reminders** — Track follow-ups, quote expiries, and check-in/out dates
- **Dashboard** — Stats overview with recent quotes and upcoming reminders

## Tech Stack

- **Backend**: Node.js / Express
- **Frontend**: React / Vite / TailwindCSS
- **Database**: Supabase (PostgreSQL)
- **PDF**: PDFKit
- **Deploy**: Railway

---

## Setup Instructions

### 1. Supabase Database

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and paste the contents of `supabase/schema.sql`
3. Run the SQL to create all tables
4. Copy your **Project URL** and **Service Role Key** from Settings → API

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required:
- `SUPABASE_URL` — Your Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key (not the anon key)
- `PORT` — Server port (default 3001)

Optional:
- `HOSTAWAY_API_KEY` — Add via Settings page in the app instead
- `HOSTAWAY_ACCOUNT_ID` — Add via Settings page in the app instead

### 3. Install & Run Locally

```bash
# Install all dependencies
npm run install:all

# Run both server and client in development
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### 4. First Steps in the App

1. Go to **Settings** → **Company** tab → Enter your company name, email, address
2. Go to **Settings** → **API Keys** tab → Enter your Hostaway credentials
3. Go to **Properties** → Click **Sync from Hostaway**
4. Go to **Clients** → Add your first business client
5. Go to **Quotes** → Create your first quote → Download PDF

---

## Deploy to Railway

### Option A: One-Click

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `NODE_ENV=production`
4. Railway auto-detects Node.js, runs `npm install` (which triggers `postinstall` for the client), then `npm start`

### Option B: Railway CLI

```bash
railway login
railway init
railway up
```

### Build Process

Railway runs these automatically:
1. `npm install` → installs server deps
2. `postinstall` → `cd client && npm install` → installs client deps
3. On deploy, you need to set a build command: `npm run build`
4. `npm start` → runs Express which serves the built frontend

Set these in Railway:
- **Build Command**: `npm run build`
- **Start Command**: `npm start`

---

## PDF Configuration

All PDF settings are configurable through the **Settings** page:

| Setting | Description |
|---------|-------------|
| Logo URL | Direct URL to your logo image |
| Logo Position | Left, Center, or Right |
| Logo Width | Width in pixels (50-400) |
| Primary Color | Headings, total bar |
| Secondary Color | Body text, labels |
| Accent Color | Header line, highlights |
| Page Size | A4 or US Letter |
| Footer Text | Custom footer message |
| Payment Instructions | Bank details, payment link |
| Terms & Conditions | Legal terms shown on quote |
| Quote Validity | Days until quote expires |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/hostaway/sync` | Sync listings from Hostaway |
| GET | `/api/properties` | List all properties |
| GET/POST | `/api/clients` | List/Create clients |
| GET | `/api/clients/:id` | Client detail with contacts & quotes |
| POST | `/api/clients/:id/contacts` | Add contact to client |
| GET/POST | `/api/quotes` | List/Create quotes |
| POST | `/api/quotes/:id/pdf` | Generate quote PDF |
| POST | `/api/quotes/:id/duplicate` | Duplicate a quote |
| GET/POST | `/api/discounts` | List/Create discount codes |
| POST | `/api/discounts/validate` | Validate a discount code |
| GET/POST | `/api/reminders` | List/Create reminders |
| GET/PUT | `/api/config` | Get/Update company config |
| GET | `/api/config/dashboard-stats` | Dashboard statistics |
