// ---------------------------------------------------------------------------
// CLIENT CONSULTATION PHOTOS — ADMIN ONLY
//
// These are photos of a real, identifiable client's hands and nails, usually
// attached to a specific appointment (before / after / reference shots).
//
// This module intentionally exports NO public route handler and NO public
// serializer. Nothing here is reachable from /api/config or any other
// unauthenticated endpoint, and it must stay that way: the salon's clients did
// not consent to their photos appearing on a public website.
//
// If you ever need to show one of these publicly, the correct move is to copy
// it into the `media` gallery explicitly (an intentional act by the admin), not
// to widen access here.
// ---------------------------------------------------------------------------

const { writeDb } = require('../db');
const { json, readBody, safeString } = require('../helpers');
const { repositories } = require('../repositories');

const PHASES = ['before', 'after', 'reference'];

async function handleAdminRoutes({ req, res, pathname, db, salonId }) {
  const repos = repositories(db);
  const photos = repos.clientPhotos;

  // LIST for one client
  const listMatch = pathname.match(/^\/api\/admin\/clients\/([^/]+)\/photos$/);
  if (req.method === 'GET' && listMatch) {
    const clientId = listMatch[1];
    if (!repos.clients.exists(clientId)) {
      json(res, 404, { error: 'Clienta no encontrada.' });
      return true;
    }
    json(res, 200, { photos: photos.byClient(clientId) });
    return true;
  }

  // ADD a photo to a client
  if (req.method === 'POST' && listMatch) {
    const clientId = listMatch[1];
    // The client must genuinely exist: the DB has a foreign key on client_id,
    // so inserting against a bogus id would fail later with an opaque Postgres
    // error. Check here and say something useful instead.
    if (!repos.clients.exists(clientId)) {
      json(res, 404, { error: 'Clienta no encontrada.' });
      return true;
    }

    const body = await readBody(req);
    const url = safeString(body.url, 1000);
    if (!url) { json(res, 400, { error: 'Sube una foto primero.' }); return true; }

    const phase = PHASES.includes(body.phase) ? body.phase : 'after';
    const appointmentId = safeString(body.appointmentId, 80) || null;

    const photo = photos.create({
      clientId,
      appointmentId: appointmentId && repos.appointments.exists(appointmentId) ? appointmentId : null,
      url,
      note: safeString(body.note, 300),
      phase,
      createdAt: new Date().toISOString()
    });

    await writeDb(db, salonId);
    json(res, 201, { photo });
    return true;
  }

  // DELETE a single photo
  const photoMatch = pathname.match(/^\/api\/admin\/client-photos\/([^/]+)$/);
  if (req.method === 'DELETE' && photoMatch) {
    if (!photos.remove(photoMatch[1])) {
      json(res, 404, { error: 'Foto no encontrada.' });
      return true;
    }
    await writeDb(db, salonId);
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}

// Called by the clients domain when a client is deleted, so her photos go with
// her instead of being orphaned. Postgres cascades too (see migration 002), but
// the in-memory array must be kept consistent or the record-level diff would
// try to write rows referencing a client that no longer exists.
function removePhotosForClient(db, clientId) {
  return repositories(db).clientPhotos.removeForClient(clientId);
}

module.exports = { handleAdminRoutes, removePhotosForClient };
