const { writeDb } = require('../db');
const { json, readBody, safeString } = require('../helpers');
const { repositories } = require('../repositories');

// Only what the public site needs. Deliberately narrow: no internal ids beyond
// the one needed for React keys, no timestamps, no inactive members.
function publicStaffMember(m) {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    bio: m.bio,
    photoUrl: m.photoUrl,
    instagram: m.instagram
  };
}

function publicStaff(db) {
  return repositories(db).staff.active().map(publicStaffMember);
}

async function handleAdminRoutes({ req, res, pathname, db, salonId }) {
  const repo = repositories(db).staff;

  // CREATE
  if (req.method === 'POST' && pathname === '/api/admin/staff') {
    const body = await readBody(req);
    const name = safeString(body.name, 120);
    if (!name) { json(res, 400, { error: 'El nombre es obligatorio.' }); return true; }

    const member = repo.create({
      name,
      role: safeString(body.role, 120),
      bio: safeString(body.bio, 600),
      photoUrl: safeString(body.photoUrl, 1000),
      instagram: safeString(body.instagram, 200),
      active: body.active !== false,
      sort: Number(body.sort) || (repo.count() + 1) * 10
    });

    await writeDb(db, salonId);
    json(res, 201, { member });
    return true;
  }

  const idMatch = pathname.match(/^\/api\/admin\/staff\/([^/]+)$/);

  // UPDATE — partial: only fields actually present in the body are touched, so
  // saving the form without re-picking a photo cannot blank out photoUrl.
  if (req.method === 'PATCH' && idMatch) {
    const body = await readBody(req);
    const patch = {};
    if (body.name !== undefined) patch.name = safeString(body.name, 120);
    if (body.role !== undefined) patch.role = safeString(body.role, 120);
    if (body.bio !== undefined) patch.bio = safeString(body.bio, 600);
    if (body.photoUrl !== undefined) patch.photoUrl = safeString(body.photoUrl, 1000);
    if (body.instagram !== undefined) patch.instagram = safeString(body.instagram, 200);
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;

    const member = repo.update(idMatch[1], patch);
    if (!member) { json(res, 404, { error: 'Miembro del equipo no encontrado.' }); return true; }

    await writeDb(db, salonId);
    json(res, 200, { member });
    return true;
  }

  // DELETE
  if (req.method === 'DELETE' && idMatch) {
    if (!repo.remove(idMatch[1])) {
      json(res, 404, { error: 'Miembro del equipo no encontrado.' });
      return true;
    }
    await writeDb(db, salonId);
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handleAdminRoutes, publicStaff, publicStaffMember };
