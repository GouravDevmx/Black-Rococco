/*
  Black Rococo server — thin bootstrap only.

  This file wires together: static file serving and dispatch to feature
  modules under lib/domains/. It should rarely need edits on its own — if
  you're fixing or adding a feature, the file you want is almost certainly
  one of:

    lib/domains/services.js        Admin -> SERVICIOS (services CRUD, featured toggle)
    lib/domains/promotions.js      Admin -> PROMOCIONES (discount engine + CRUD)
    lib/domains/courses.js         Admin -> ACADEMIA (courses + registrations)
    lib/domains/media.js           Admin -> GALERIA (photo/video library)
    lib/domains/clients.js         Admin -> CLIENTAS (CRM profile + stats)
    lib/domains/bookings.js        Booking flow, availability, appointment status
    lib/domains/notifications.js   Notification creation, webhook dispatch, reminders
    lib/domains/posts.js           Admin -> PUBLICAR (legacy quick social post log)
    lib/domains/admin-auth.js      Login/logout/session verification
    lib/domains/admin-dashboard.js The main admin dashboard aggregation route
    lib/domains/admin-uploads.js   File upload handling
    lib/domains/google-calendar.js Automatic Google Calendar sync (OAuth connect + event create/delete)
    lib/domains/whatsapp.js        WhatsApp/Calendar link + message wording
    lib/domains/appointments.js    Shapes a raw appointment into its public view
    lib/domains/availability.js    Slot overlap/availability calculation

  This app serves exactly ONE salon (Black Rococo). Runs on a local JSON
  file by default (zero setup, offline-friendly demo mode). Set
  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist to a real Postgres
  database instead — the salon is resolved once at boot (see below), not
  per-request. See docs/SAAS_DEPLOYMENT.md.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const { getSalonBySlug } = require('./lib/tenant');
const { verifyStorageBucket } = require('./lib/uploads');
const { SITE_URL } = require('./lib/config');

// P0: the social-preview tags in index.html hardcode https://blackrococo.mx.
// og:image MUST be an absolute URL that actually resolves — WhatsApp, Facebook
// and Instagram fetch it directly and do NOT execute JavaScript, so if that
// domain isn't the one serving the app, every shared link renders with a blank
// preview. Rewriting the canonical origin at serve time means the tags are
// always correct for whatever domain is really live (set SITE_URL in Railway;
// if it's unset we fall back to the request's own Host, which is still right).
const CANONICAL_PLACEHOLDER = /https:\/\/blackrococo\.mx/g;

function withCanonicalOrigin(html, req) {
  let origin = SITE_URL;
  if (!origin) {
    const host = req.headers.host;
    if (!host) return html; // nothing better to offer; leave as-is
    const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
      || (req.socket.encrypted ? 'https' : 'http');
    origin = `${proto}://${host}`;
  }
  return html.replace(CANONICAL_PLACEHOLDER, origin);
}
const { readDb } = require('./lib/db');
const { json, text } = require('./lib/helpers');
const {
  PUBLIC_DIR, PORT, ADMIN_EMAIL, ADMIN_PASSWORD, USE_SUPABASE, SALON_SLUG, CLIENT_REMINDER_HOURS
} = require('./lib/config');

const publicConfig = require('./lib/domains/public-config');
const adminAuth = require('./lib/domains/admin-auth');
const bookings = require('./lib/domains/bookings');
const servicesDomain = require('./lib/domains/services');
const promotions = require('./lib/domains/promotions');
const clientsDomain = require('./lib/domains/clients');
const mediaDomain = require('./lib/domains/media');
const staffDomain = require('./lib/domains/staff');
const clientPhotosDomain = require('./lib/domains/client-photos');
const coursesDomain = require('./lib/domains/courses');
const postsDomain = require('./lib/domains/posts');
const notificationsDomain = require('./lib/domains/notifications');
const adminDashboard = require('./lib/domains/admin-dashboard');
const adminUploads = require('./lib/domains/admin-uploads');
const googleCalendarDomain = require('./lib/domains/google-calendar');
const adminSettings = require('./lib/domains/admin-settings');

// Resolved once at boot (see startServer below), not per-request. null in
// local JSON-file mode.
let SALON_ID = null;
let SALON = null;

async function handleApi(req, res, pathname, url) {
  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return json(res, 200, { ok: true, service: 'black-rococo', time: new Date().toISOString() });
    }

    if (req.method === 'GET' && pathname === '/api/admin/google-calendar/callback') {
      return googleCalendarDomain.handleCallbackRoute(req, res, url, SALON_ID);
    }

    const salonId = SALON_ID;
    const salon = SALON;

    // --- Public routes (no admin session required) ---
    const publicCtx = { req, res, pathname, url, salonId, salon };

    if ((req.method === 'POST' && pathname === '/api/bookings') || (req.method === 'GET' && pathname === '/api/availability') || (req.method === 'GET' && pathname === '/api/rebook')) {
      const db = await readDb(salonId);
      if (await bookings.handlePublicRoutes({ ...publicCtx, db })) return;
    }
    if (req.method === 'GET' && pathname === '/api/config') {
      const db = await readDb(salonId);
      if (await publicConfig.handlePublicRoutes({ ...publicCtx, db })) return;
    }
    if (req.method === 'POST' && pathname === '/api/course-registrations') {
      const db = await readDb(salonId);
      if (await coursesDomain.handlePublicRoutes({ ...publicCtx, db })) return;
    }
    if (await adminAuth.handlePublicRoutes(publicCtx)) return;

    // --- Admin routes (session required) ---
    if (pathname.startsWith('/api/admin/')) {
      if (!adminAuth.requireAdmin(req, res)) return;
      const db = await readDb(salonId);
      const adminCtx = { req, res, pathname, url, db, salonId, salon };

      if (await adminUploads.handleAdminRoutes(adminCtx)) return;
      if (await adminDashboard.handleAdminRoutes(adminCtx)) return;
      if (await notificationsDomain.handleAdminRoutes(adminCtx)) return;
      if (await bookings.handleAdminRoutes(adminCtx)) return;
      // Must run BEFORE clientsDomain: that module matches
      // /api/admin/clients/:id, which would otherwise swallow the nested
      // /api/admin/clients/:id/photos routes.
      if (await clientPhotosDomain.handleAdminRoutes(adminCtx)) return;
      if (await clientsDomain.handleAdminRoutes(adminCtx)) return;
      if (await staffDomain.handleAdminRoutes(adminCtx)) return;
      if (await servicesDomain.handleAdminRoutes(adminCtx)) return;
      if (await promotions.handleAdminRoutes(adminCtx)) return;
      if (await coursesDomain.handleAdminRoutes(adminCtx)) return;
      if (await mediaDomain.handleAdminRoutes(adminCtx)) return;
      if (await postsDomain.handleAdminRoutes(adminCtx)) return;
      if (await googleCalendarDomain.handleAdminRoutes(adminCtx)) return;
      if (await adminSettings.handleAdminRoutes(adminCtx)) return;
    }

    return json(res, 404, { error: 'API route not found' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${pathname} ->`, err.stack || err.message);
    return json(res, 500, { error: 'Ocurrió un error inesperado. Intenta de nuevo en unos momentos.' });
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);

  // decodeURIComponent throws URIError on malformed input (e.g. a bare `%`).
  // Unguarded, that crashed the whole server — see the http.createServer
  // comment above. A bad path is a 400, not a fatal error.
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return text(res, 400, 'Bad request');
  }

  // Reject NUL bytes outright: path APIs treat them as string terminators, so
  // "safe.png\0../../etc/passwd" can smuggle a traversal past naive checks.
  if (rel.includes('\0')) return text(res, 400, 'Bad request');

  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));

  // P0: the guard used to be `filePath.startsWith(PUBLIC_DIR)`, a raw prefix
  // test with no path-boundary check. "/app/public" also prefixes
  // "/app/public-secret", so `../public-secret/x` normalized to a SIBLING
  // directory and sailed straight through. Compare against PUBLIC_DIR + sep.
  const root = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(root)) {
    return text(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: any unknown path serves index.html.
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (fallbackErr, fallback) => {
        if (fallbackErr) return text(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(withCanonicalOrigin(fallback.toString('utf8'), req));
      });
      return;
    }

    const isHtml = filePath.endsWith('.html');
    const body = isHtml ? withCanonicalOrigin(data.toString('utf8'), req) : data;

    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': isHtml ? 'no-store' : 'public, max-age=3600'
    });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  // P0: this callback used to be completely unguarded. `new URL()` throws on a
  // malformed Host header, and serveStatic's decodeURIComponent() throws
  // URIError on a malformed path — so a single `GET /%` raised an
  // uncaughtException and KILLED THE PROCESS. Any visitor could take the salon
  // offline with one request, repeatedly. Nothing may escape this try/catch.
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return text(res, 400, 'Bad request');
  }

  const pathname = url.pathname;
  try {
    if (pathname.startsWith('/api/')) {
      // handleApi is async: a rejected promise here would become an
      // unhandledRejection, which Node also treats as fatal. Catch it.
      return handleApi(req, res, pathname, url).catch(err => {
        console.error(`[${new Date().toISOString()}] unhandled API rejection ${req.method} ${pathname} ->`, err.stack || err.message);
        if (!res.headersSent) json(res, 500, { error: 'Ocurrió un error inesperado.' });
      });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] request handler threw ${req.method} ${pathname} ->`, err.stack || err.message);
    if (!res.headersSent) text(res, 500, 'Internal error');
  }
});

async function startServer() {
  if (USE_SUPABASE) {
    const salon = await getSalonBySlug(SALON_SLUG);
    if (!salon) {
      console.error(`\nFATAL: no salon found with slug "${SALON_SLUG}" in Supabase.`);
      console.error('Run sql/schema.sql (or check the salons table) and set SALON_SLUG to match, then restart.\n');
      process.exit(1);
    }
    SALON = salon;
    SALON_ID = salon.id;
    console.log(`Connected to Supabase salon "${salon.name}" (slug: ${SALON_SLUG}).`);

    // Fail-fast on storage misconfiguration. Every image upload in the app
    // (hero, services, gallery, courses, posts) writes to this one bucket, so
    // if it's missing or private, uploads break everywhere at once — and the
    // symptom looks like a broken button, not a config problem. Say so at boot.
    try {
      const storage = await verifyStorageBucket();
      if (storage.ok) {
        console.log(`Storage bucket "${storage.bucket}" OK (public).`);
      } else {
        console.warn('\n⚠  STORAGE NOT READY — las subidas de fotos van a fallar.');
        console.warn(`   Motivo: ${storage.reason}`);
        if (storage.buckets) console.warn(`   Buckets encontrados: ${storage.buckets.join(', ') || '(ninguno)'}`);
        console.warn('   Arreglo: crea un bucket PÚBLICO con ese nombre en Supabase → Storage,');
        console.warn('   o define SUPABASE_STORAGE_BUCKET con el nombre correcto.\n');
      }
    } catch (err) {
      console.warn(`⚠  No se pudo verificar el bucket de storage: ${err.message}`);
    }
  }

  setTimeout(() => notificationsDomain.processClientReminders(SALON_ID).catch(err => console.error('processClientReminders error:', err.message)), 5000);
  setInterval(() => notificationsDomain.processClientReminders(SALON_ID).catch(err => console.error('processClientReminders error:', err.message)), 10 * 60 * 1000);

  // Last line of defence. A single unhandled throw anywhere must not be able to
  // take the salon's booking site offline. Log loudly and keep serving: a
  // half-broken request is strictly better than a dead process.
  process.on('uncaughtException', err => {
    console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION (server kept alive):`, err.stack || err.message);
  });
  process.on('unhandledRejection', err => {
    console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION (server kept alive):`, (err && err.stack) || err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Black Rococo running on port ${PORT}`);
    console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log(`Reminder checks: ${CLIENT_REMINDER_HOURS.join(', ')} hours before appointment`);
  });
}

startServer().catch(err => {
  console.error('FATAL: failed to start server:', err.message);
  process.exit(1);
});
