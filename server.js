/*
  Black Rococo platform server — thin bootstrap only.

  This file wires together: static file serving, per-request tenant
  resolution (see lib/tenant.js), and dispatch to feature modules under
  lib/domains/. It should rarely need edits on its own — if you're fixing
  or adding a feature, the file you want is almost certainly one of:

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
    lib/domains/whatsapp.js        WhatsApp/Calendar link + message wording
    lib/domains/appointments.js    Shapes a raw appointment into its public view
    lib/domains/availability.js    Slot overlap/availability calculation

  Runs on a local JSON file by default (zero setup, offline-friendly demo
  mode). Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run as a real
  multi-tenant SaaS backend: one deployment serving multiple salons, each
  resolved per request (subdomain, ?salon= query param, or X-Salon-Slug
  header - see lib/tenant.js). See docs/SAAS_DEPLOYMENT.md.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const { resolveSalonFromRequest } = require('./lib/tenant');
const { readDb } = require('./lib/db');
const { json, text } = require('./lib/helpers');
const {
  PUBLIC_DIR, PORT, ADMIN_EMAIL, ADMIN_PASSWORD, USE_SUPABASE, CLIENT_REMINDER_HOURS
} = require('./lib/config');

const publicConfig = require('./lib/domains/public-config');
const adminAuth = require('./lib/domains/admin-auth');
const bookings = require('./lib/domains/bookings');
const servicesDomain = require('./lib/domains/services');
const promotions = require('./lib/domains/promotions');
const clientsDomain = require('./lib/domains/clients');
const mediaDomain = require('./lib/domains/media');
const coursesDomain = require('./lib/domains/courses');
const postsDomain = require('./lib/domains/posts');
const notificationsDomain = require('./lib/domains/notifications');
const adminDashboard = require('./lib/domains/admin-dashboard');
const adminUploads = require('./lib/domains/admin-uploads');

async function handleApi(req, res, pathname, url) {
  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return json(res, 200, { ok: true, service: 'black-rococo', time: new Date().toISOString() });
    }

    let salonId = null;
    let salon = null;
    if (USE_SUPABASE) {
      const resolved = await resolveSalonFromRequest(req, url);
      salon = resolved.salon;
      if (!salon) {
        return json(res, 404, {
          error: resolved.slug
            ? `No se encontró el salón "${resolved.slug}". Verifica la URL o el parámetro ?salon=.`
            : 'No se especificó ningún salón. Agrega ?salon=tu-slug a la URL (o configura un subdominio).'
        });
      }
      salonId = salon.id;
    }

    // --- Public routes (no admin session required) ---
    const publicCtx = { req, res, pathname, url, salonId, salon };

    if ((req.method === 'POST' && pathname === '/api/bookings') || (req.method === 'GET' && pathname === '/api/availability')) {
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

    // --- Admin routes (session required, scoped to the resolved salon) ---
    if (pathname.startsWith('/api/admin/')) {
      if (!adminAuth.requireAdmin(req, res, salonId)) return;
      const db = await readDb(salonId);
      const adminCtx = { req, res, pathname, url, db, salonId, salon };

      if (await adminUploads.handleAdminRoutes(adminCtx)) return;
      if (await adminDashboard.handleAdminRoutes(adminCtx)) return;
      if (await notificationsDomain.handleAdminRoutes(adminCtx)) return;
      if (await bookings.handleAdminRoutes(adminCtx)) return;
      if (await clientsDomain.handleAdminRoutes(adminCtx)) return;
      if (await servicesDomain.handleAdminRoutes(adminCtx)) return;
      if (await promotions.handleAdminRoutes(adminCtx)) return;
      if (await coursesDomain.handleAdminRoutes(adminCtx)) return;
      if (await mediaDomain.handleAdminRoutes(adminCtx)) return;
      if (await postsDomain.handleAdminRoutes(adminCtx)) return;
    }

    return json(res, 404, { error: 'API route not found' });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Server error' });
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
  rel = decodeURIComponent(rel);
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return text(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (fallbackErr, fallback) => {
        if (fallbackErr) return text(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': filePath.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname, url);
  return serveStatic(req, res, pathname);
});

setTimeout(() => notificationsDomain.processClientReminders().catch(err => console.error('processClientReminders error:', err.message)), 5000);
setInterval(() => notificationsDomain.processClientReminders().catch(err => console.error('processClientReminders error:', err.message)), 10 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Black Rococo MVP running on port ${PORT}`);
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Reminder checks: ${CLIENT_REMINDER_HOURS.join(', ')} hours before appointment`);
});
