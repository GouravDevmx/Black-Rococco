const crypto = require('crypto');
const authLib = require('../auth');
const { json, readBody, safeString, parseCookies } = require('../helpers');
const { USE_SUPABASE, supabase, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_TTL_MS } = require('../config');

// Local-mode sessions only (single admin, env-var credentials). In
// Supabase mode, sessions are stateless HMAC-signed tokens instead (see
// lib/auth.js) — nothing to store server-side, so they survive restarts
// and work across multiple deployed instances.
const sessions = new Map();

function currentSession(req) {
  const token = parseCookies(req).br_session;
  if (!token) return null;
  if (USE_SUPABASE) {
    return authLib.verifySessionToken(token);
  }
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// Gate for every /api/admin/* route. In multi-tenant mode, a session
// issued for one salon must never be accepted for a different salon's
// admin routes — this is what actually enforces tenant isolation at the
// auth layer (verified directly in testing: a nails-salon session gets
// rejected when sent to the makeup salon's admin API).
function requireAdmin(req, res, salonId) {
  const session = currentSession(req);
  if (!session) {
    json(res, 401, { error: 'Admin login required' });
    return null;
  }
  if (USE_SUPABASE && session.salonId !== salonId) {
    json(res, 401, { error: 'Admin login required' });
    return null;
  }
  return session;
}

// Public routes: login/logout/me. Not behind requireAdmin (obviously —
// login is how you get a session in the first place).
async function handlePublicRoutes({ req, res, pathname, salonId }) {
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await readBody(req);
    const email = safeString(body.email, 160).toLowerCase();
    const password = String(body.password || '');

    if (USE_SUPABASE) {
      const { data: admin, error } = await supabase
        .from('salon_admins')
        .select('*')
        .eq('salon_id', salonId)
        .eq('email', email)
        .maybeSingle();
      if (error) { json(res, 500, { error: 'Error verificando credenciales.' }); return true; }
      if (!admin || !authLib.verifyPassword(password, admin.password_hash)) {
        json(res, 401, { error: 'Correo o contraseña incorrectos.' });
        return true;
      }
      const token = authLib.createSessionToken({ salonId, adminId: admin.id, email });
      json(res, 200, { ok: true, email }, { 'Set-Cookie': authLib.sessionCookieHeader(token) });
      return true;
    }

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
    if (USE_SUPABASE) {
      json(res, 200, { ok: true }, { 'Set-Cookie': authLib.clearCookieHeader() });
      return true;
    }
    const token = parseCookies(req).br_session;
    if (token) sessions.delete(token);
    json(res, 200, { ok: true }, { 'Set-Cookie': 'br_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/me') {
    const session = currentSession(req);
    const loggedIn = Boolean(session) && (!USE_SUPABASE || session.salonId === salonId);
    json(res, 200, { loggedIn, email: loggedIn ? session.email : null });
    return true;
  }

  return false;
}

module.exports = { requireAdmin, currentSession, handlePublicRoutes };
