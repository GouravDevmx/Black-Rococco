const crypto = require('crypto');
const { json, readBody, safeString, parseCookies } = require('../helpers');
const { ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_TTL_MS } = require('../config');

// Single admin, env-var credentials, in-memory session — same in local and
// Supabase mode. Sessions don't survive a server restart (fine: this
// business has one owner logging in from a handful of devices, not a fleet
// of salons needing isolated accounts).
const sessions = new Map();

function currentSession(req) {
  const token = parseCookies(req).br_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// Gate for every /api/admin/* route.
function requireAdmin(req, res) {
  const session = currentSession(req);
  if (!session) {
    json(res, 401, { error: 'Admin login required' });
    return null;
  }
  return session;
}

// Public routes: login/logout/me. Not behind requireAdmin (obviously —
// login is how you get a session in the first place).
async function handlePublicRoutes({ req, res, pathname }) {
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await readBody(req);
    const email = safeString(body.email, 160).toLowerCase();
    const password = String(body.password || '');

    if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
      json(res, 401, { error: 'Correo o contraseña incorrectos.' });
      return true;
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { email, expiresAt: Date.now() + SESSION_TTL_MS });
    json(res, 200, { ok: true, email }, {
      'Set-Cookie': `br_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    const token = parseCookies(req).br_session;
    if (token) sessions.delete(token);
    json(res, 200, { ok: true }, { 'Set-Cookie': 'br_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/me') {
    const session = currentSession(req);
    json(res, 200, { loggedIn: Boolean(session), email: session?.email || null });
    return true;
  }

  return false;
}

module.exports = { requireAdmin, currentSession, handlePublicRoutes };
