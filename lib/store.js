const fs = require('fs');
const supabase = require('./supabaseClient');

// ---------------------------------------------------------------------------
// RECORD-LEVEL PERSISTENCE ENGINE  (EPIC 1 / STORY 1)
//
// Previously this module did a "full collection sync" on every write: it
// upserted EVERY row of EVERY collection and deleted any row not present in
// the in-memory copy. Correct for one request in isolation, but it silently
// destroyed data under concurrency:
//
//   1. Request A reads the DB          (notifications = [1,2,3])
//   2. Request B creates notification 4 and writes
//   3. Request A writes its now-stale copy -> the sync sees row 4 in the
//      table but not in memory -> DELETES row 4.
//
// The fix: on read we take a SNAPSHOT of exactly what we saw. On write we
// DIFF current in-memory state against that baseline and emit only:
//
//   * INSERT  records that appeared since our read
//   * UPDATE  records whose fields actually differ
//   * DELETE  ONLY records that were in OUR baseline and were explicitly
//             removed during THIS request
//
// Because deletes are scoped to the baseline, a stale request can no longer
// delete rows it never knew existed. Row 4 above survives. Unchanged records
// produce zero writes.
//
// Route handlers are untouched: they still mutate the same plain JS object.
// The snapshot lives in a WeakMap keyed on that object, so it is collected
// with the request and never leaks.
// ---------------------------------------------------------------------------

const SNAPSHOTS = new WeakMap();

function rowToJs(row, fields) {
  const out = {};
  for (const [jsKey, sqlKey] of fields) out[jsKey] = row[sqlKey];
  return out;
}

function jsToRow(obj, fields, extra) {
  const out = { ...extra };
  for (const [jsKey, sqlKey] of fields) {
    // Omit undefined so Postgres applies the column default. An explicit null
    // is preserved on purpose — some columns (applied_promotion, start_date)
    // are genuinely nullable and mean something by being null.
    if (obj[jsKey] !== undefined) out[sqlKey] = obj[jsKey];
  }
  return out;
}

// Stable serialization used to answer "did this record actually change?".
// Key order is fixed by the field map, so it is deterministic.
function fingerprint(obj, fields) {
  const parts = [];
  for (const [jsKey] of fields) {
    parts.push(JSON.stringify(obj[jsKey] === undefined ? null : obj[jsKey]));
  }
  return parts.join('\u0001');
}

// ---------------------------------------------------------------------------
// Collection field maps (jsKey <-> sqlColumn). Must match sql/schema.sql.
// ---------------------------------------------------------------------------

const SERVICE_FIELDS = [
  ['id', 'id'], ['cat', 'cat'], ['name', 'name'], ['desc', 'description'],
  ['price', 'price'], ['dur', 'duration_minutes'], ['imageUrl', 'image_url'],
  ['imageUrls', 'image_urls'], ['active', 'active'], ['sort', 'sort_order']
];

const CLIENT_FIELDS = [
  ['id', 'id'], ['name', 'name'], ['whatsapp', 'whatsapp'], ['email', 'email'],
  ['instagram', 'instagram'], ['birthday', 'birthday'], ['styleChoice', 'style_choice'],
  ['colorChoice', 'color_choice'], ['drinkChoice', 'drink_choice'],
  ['timePreference', 'time_preference'], ['notes', 'notes'], ['allergies', 'allergies'],
  ['createdAt', 'created_at'], ['updatedAt', 'updated_at']
];

const APPOINTMENT_FIELDS = [
  ['id', 'id'], ['clientId', 'client_id'], ['serviceId', 'service_id'],
  ['date', 'appt_date'], ['time', 'appt_time'], ['status', 'status'],
  ['preferencesSnapshot', 'preferences_snapshot'], ['finalPrice', 'final_price'],
  ['appliedPromotion', 'applied_promotion'], ['remindersSent', 'reminders_sent'],
  ['googleEventId', 'google_event_id'], ['createdAt', 'created_at']
];
// `folio` is derived from the DB-assigned `folio_number` (bigserial), not a
// real column — deliberately absent from the map so it is never written.

const PROMOTION_FIELDS = [
  ['id', 'id'], ['code', 'code'], ['label', 'label'], ['title', 'title'], ['note', 'note'],
  ['type', 'discount_type'], ['value', 'value'], ['scope', 'scope'],
  ['categoryValue', 'category_value'], ['serviceIds', 'service_ids'],
  ['startDate', 'start_date'], ['endDate', 'end_date'], ['active', 'active'],
  ['autoApply', 'auto_apply'], ['usageLimit', 'usage_limit'], ['usageCount', 'usage_count'],
  ['imageUrl', 'image_url'],
  ['createdAt', 'created_at'], ['updatedAt', 'updated_at']
];

const COURSE_FIELDS = [
  ['id', 'id'], ['title', 'title'], ['description', 'description'], ['price', 'price'],
  ['duration', 'duration'], ['level', 'level'], ['imageUrls', 'image_urls'],
  ['capacity', 'capacity'], ['startDate', 'start_date'], ['active', 'active'],
  ['sort', 'sort_order'], ['createdAt', 'created_at'], ['updatedAt', 'updated_at']
];

const COURSE_REGISTRATION_FIELDS = [
  ['id', 'id'], ['courseId', 'course_id'], ['name', 'name'], ['whatsapp', 'whatsapp'],
  ['email', 'email'], ['notes', 'notes'], ['status', 'status'], ['createdAt', 'created_at']
];

const MEDIA_FIELDS = [
  ['id', 'id'], ['kind', 'kind'], ['url', 'url'], ['posterUrl', 'poster_url'],
  ['title', 'title'], ['description', 'description'], ['category', 'category'],
  ['order', 'sort_order'], ['showInCarousel', 'show_in_carousel'],
  ['showInGallery', 'show_in_gallery'], ['createdAt', 'created_at'], ['updatedAt', 'updated_at']
];

const NOTIFICATION_FIELDS = [
  ['id', 'id'], ['kind', 'kind'], ['channel', 'channel'], ['title', 'title'],
  ['message', 'message'], ['appointmentId', 'appointment_id'], ['status', 'status'],
  ['actionLabel', 'action_label'], ['actionUrl', 'action_url'], ['error', 'error'],
  ['unread', 'unread'], ['createdAt', 'created_at'], ['updatedAt', 'updated_at']
];

const STAFF_FIELDS = [
  ['id', 'id'], ['name', 'name'], ['role', 'role'], ['bio', 'bio'],
  ['photoUrl', 'photo_url'], ['instagram', 'instagram'], ['active', 'active'],
  ['sort', 'sort_order'], ['createdAt', 'created_at'], ['updatedAt', 'updated_at']
];

// Consultation / before-after photos. ADMIN ONLY — never exposed publicly.
const CLIENT_PHOTO_FIELDS = [
  ['id', 'id'], ['clientId', 'client_id'], ['appointmentId', 'appointment_id'],
  ['url', 'url'], ['note', 'note'], ['phase', 'phase'], ['createdAt', 'created_at']
];

const POST_FIELDS = [
  ['id', 'id'], ['caption', 'caption'], ['imageUrl', 'image_url'],
  ['targets', 'targets'], ['publishedAt', 'published_at']
];

// The single registry driving read, diff and write. Adding a collection here
// is the only step needed to make it fully participate.
const COLLECTIONS = [
  { key: 'services',            table: 'services',             fields: SERVICE_FIELDS,             orderBy: 'sort_order' },
  { key: 'clients',             table: 'clients',              fields: CLIENT_FIELDS },
  { key: 'appointments',        table: 'appointments',         fields: APPOINTMENT_FIELDS },
  { key: 'promotions',          table: 'promotions',           fields: PROMOTION_FIELDS },
  { key: 'courses',             table: 'courses',              fields: COURSE_FIELDS,              orderBy: 'sort_order' },
  { key: 'courseRegistrations', table: 'course_registrations', fields: COURSE_REGISTRATION_FIELDS },
  { key: 'media',               table: 'media',                fields: MEDIA_FIELDS,               orderBy: 'sort_order' },
  { key: 'notifications',       table: 'notifications',        fields: NOTIFICATION_FIELDS },
  { key: 'posts',               table: 'posts',                fields: POST_FIELDS },
  { key: 'staff',               table: 'staff',                fields: STAFF_FIELDS,               orderBy: 'sort_order' },
  { key: 'clientPhotos',        table: 'client_photos',        fields: CLIENT_PHOTO_FIELDS }
];

const COLLECTION_BY_KEY = Object.fromEntries(COLLECTIONS.map(c => [c.key, c]));

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function fetchCollection(table, salonId, fields, orderBy) {
  let query = supabase.from(table).select('*').eq('salon_id', salonId);
  if (orderBy) query = query.order(orderBy, { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(`Supabase read failed (${table}): ${error.message}`);
  return (data || []).map(row => rowToJs(row, fields));
}

async function fetchAppointments(salonId) {
  const { data, error } = await supabase.from('appointments').select('*').eq('salon_id', salonId);
  if (error) throw new Error(`Supabase read failed (appointments): ${error.message}`);
  return (data || []).map(row => {
    const js = rowToJs(row, APPOINTMENT_FIELDS);
    js.folio = `BR-${row.folio_number}`;
    return js;
  });
}

// Records exactly what we read, so writeDb can diff against it.
function takeSnapshot(db) {
  const collections = {};
  for (const { key, fields } of COLLECTIONS) {
    const map = new Map();
    for (const item of db[key] || []) {
      if (item && item.id !== undefined && item.id !== null) {
        map.set(item.id, fingerprint(item, fields));
      }
    }
    collections[key] = map;
  }
  SNAPSHOTS.set(db, { collections, settings: JSON.stringify(db.settings || {}) });
}

// Folds an already-persisted record into the baseline so the diff does NOT
// insert it a second time. Required for rows written out-of-band by
// insertAppointmentAtomic / upsertClientAndGetId, which hit Postgres directly
// before writeDb ever runs.
function markPersisted(db, collectionKey, record) {
  const snapshot = SNAPSHOTS.get(db);
  const meta = COLLECTION_BY_KEY[collectionKey];
  if (!snapshot || !meta || !record || record.id === undefined || record.id === null) return;
  snapshot.collections[collectionKey].set(record.id, fingerprint(record, meta.fields));
}

function readLocalFile(dbPath) {
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeLocalFile(dbPath, db) {
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

async function readDb(salonId, dbPath) {
  if (!salonId) return readLocalFile(dbPath);
console.log("========== SALON DEBUG ==========");
console.log("salonId received:", salonId);

const { data: allSalons, error: allSalonsError } = await supabase
  .from("salons")
  .select("id, slug, name, active");

console.log("All salons:", allSalons);
console.log("All salons error:", allSalonsError);
console.log("================================");

const { data: salonRow, error: salonErr } = await supabase
  .from("salons")
  .select("*")
  .eq("id", salonId)
  .single();

if (salonErr) {
  console.error("Salon query error:", salonErr);
  throw new Error(`Supabase read failed (salons): ${salonErr.message}`);
}
  
  const { data: salonRow, error: salonErr } = await supabase
    .from('salons').select('*').eq('id', salonId).single();
  if (salonErr) throw new Error(`Supabase read failed (salons): ${salonErr.message}`);

  const [services, clients, appointments, promotions, courses, courseRegistrations, media, notifications, posts, staff, clientPhotos] = await Promise.all([
    fetchCollection('services', salonId, SERVICE_FIELDS, 'sort_order'),
    fetchCollection('clients', salonId, CLIENT_FIELDS),
    fetchAppointments(salonId),
    fetchCollection('promotions', salonId, PROMOTION_FIELDS),
    fetchCollection('courses', salonId, COURSE_FIELDS, 'sort_order'),
    fetchCollection('course_registrations', salonId, COURSE_REGISTRATION_FIELDS),
    fetchCollection('media', salonId, MEDIA_FIELDS, 'sort_order'),
    fetchCollection('notifications', salonId, NOTIFICATION_FIELDS),
    fetchCollection('posts', salonId, POST_FIELDS),
    fetchCollection('staff', salonId, STAFF_FIELDS, 'sort_order'),
    fetchCollection('client_photos', salonId, CLIENT_PHOTO_FIELDS)
  ]);

  const db = {
    settings: {
      brand: salonRow.brand || {},
      contact: salonRow.contact || {},
      booking: salonRow.booking || {},
      featuredServiceIds: salonRow.featured_service_ids || [],
      promo: { enabled: false, label: '', title: '', note: '' },
      googleCalendarIntegration: salonRow.google_calendar || {},
      // BUGFIX: this was previously loaded as `salonConfig`, but every domain
      // module (and migrate.js) reads and writes `config`. The mismatch meant
      // `settings.config` came back undefined on every Supabase read, so
      // migrate.js rebuilt it from defaults — wiping heroImages and the custom
      // colour/drink/category lists on every single page load. Saves appeared
      // to work, then the data vanished on refresh.
      config: salonRow.salon_config || {},
      notifications: {
        adminPanel: true,
        googleCalendar: 'webhook',
        whatsappAdmin: 'webhook',
        clientReminders: [24, 2]
      }
    },
    services, clients, appointments, promotions, courses,
    courseRegistrations, media, notifications, posts, staff, clientPhotos,
    counters: { appointment: 1000, client: 1000, post: 1000, notification: 1000, promotion: 1000, course: 1000, registration: 1000, service: 1000, media: 1000, staff: 1000, clientPhoto: 1000 }
  };

  // NOTE: the snapshot is deliberately NOT taken here. migrate.js normalizes
  // the db right after this returns, and those normalizations would otherwise
  // register as phantom "changes" on every request. db.js calls takeSnapshot()
  // once migration is done, so the baseline reflects the true post-migrate state.
  return db;
}

// ---------------------------------------------------------------------------
// Write — record-level diff
// ---------------------------------------------------------------------------

// Computes exactly what changed for one collection. Pure, no I/O, unit-testable.
function diffCollection(baseline, items, fields) {
  const inserts = [];
  const updates = [];
  const seen = new Set();

  for (const item of items || []) {
    if (!item || item.id === undefined || item.id === null) continue;
    seen.add(item.id);
    const current = fingerprint(item, fields);
    if (!baseline.has(item.id)) inserts.push(item);
    else if (baseline.get(item.id) !== current) updates.push(item);
    // identical fingerprint -> unchanged -> no write at all
  }

  // Deletes are scoped to OUR baseline only. Rows another concurrent request
  // created after we read are invisible here, so we can never delete them.
  // This is the race-condition fix.
  const deletes = [];
  for (const id of baseline.keys()) {
    if (!seen.has(id)) deletes.push(id);
  }

  return { inserts, updates, deletes };
}

async function applyCollectionDiff(meta, salonId, diff) {
  const { table, fields } = meta;

  if (diff.deletes.length) {
    const { error } = await supabase
      .from(table).delete().eq('salon_id', salonId).in('id', diff.deletes);
    if (error) throw new Error(`Supabase delete failed (${table}): ${error.message}`);
  }

  if (diff.inserts.length) {
    const rows = diff.inserts.map(item => jsToRow(item, fields, { salon_id: salonId }));
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw new Error(`Supabase insert failed (${table}): ${error.message}`);
  }

  // Updated one at a time, scoped by id + salon_id, so we only ever touch the
  // specific rows this request actually modified.
  for (const item of diff.updates) {
    const row = jsToRow(item, fields, {});
    delete row.id; // never rewrite the primary key
    const { error } = await supabase
      .from(table).update(row).eq('salon_id', salonId).eq('id', item.id);
    if (error) throw new Error(`Supabase update failed (${table}): ${error.message}`);
  }
}

async function writeDb(db, salonId, dbPath) {
  if (!salonId) return writeLocalFile(dbPath, db);

  const snapshot = SNAPSHOTS.get(db);
  if (!snapshot) {
    // A db object that didn't come from readDb. Fail loudly rather than
    // silently reverting to destructive full-sync behaviour.
    throw new Error('writeDb called with a db object that has no read snapshot.');
  }

  const work = [];

  // Settings live on the single `salons` row. Only write it if it changed.
  const settingsNow = JSON.stringify(db.settings || {});
  if (settingsNow !== snapshot.settings) {
    work.push(
      supabase.from('salons').update({
        brand: db.settings.brand,
        contact: db.settings.contact,
        booking: db.settings.booking,
        featured_service_ids: db.settings.featuredServiceIds || [],
        google_calendar: db.settings.googleCalendarIntegration || {},
        salon_config: db.settings.config || {}
      }).eq('id', salonId).then(({ error }) => {
        if (error) throw new Error(`Supabase write failed (salons): ${error.message}`);
      })
    );
  }

  for (const meta of COLLECTIONS) {
    const diff = diffCollection(snapshot.collections[meta.key], db[meta.key], meta.fields);
    if (!diff.inserts.length && !diff.updates.length && !diff.deletes.length) continue;
    work.push(applyCollectionDiff(meta, salonId, diff));
  }

  await Promise.all(work);

  // Re-baseline so a second writeDb() in the same request doesn't replay work.
  takeSnapshot(db);
}

// ---------------------------------------------------------------------------
// Out-of-band writes needing a REAL database guarantee, bypassing the
// read-modify-write cycle above.
// ---------------------------------------------------------------------------

// A brand-new client must exist in the database BEFORE the appointment that
// references it is inserted, or Postgres correctly rejects the appointment (a
// foreign key can't point at a row that isn't there yet). Upserts on
// (salon_id, whatsapp) rather than id, so two simultaneous requests from the
// same new number merge into one client instead of erroring, and returns
// whichever id actually won.
async function upsertClientAndGetId(salonId, client) {
  if (!salonId) return client.id; // local JSON mode: nothing to persist early
  const row = jsToRow(client, CLIENT_FIELDS, { salon_id: salonId });
  const { data, error } = await supabase
    .from('clients').upsert(row, { onConflict: 'salon_id,whatsapp' }).select().single();
  if (error) throw new Error(`Supabase client upsert failed: ${error.message}`);
  return data.id;
}

// sql/schema.sql has a partial unique index on (salon_id, appt_date, appt_time)
// WHERE status <> 'cancelled', so Postgres itself rejects a double-booked slot
// even under fully concurrent requests — a guarantee an app-level
// "check then insert" can never provide.
async function insertAppointmentAtomic(salonId, appt) {
  const row = jsToRow(appt, APPOINTMENT_FIELDS, { salon_id: salonId });
  delete row.id; // let Postgres generate it

  const { data, error } = await supabase
    .from('appointments').insert(row).select().single();

  if (error) {
    if (error.code === '23505') return { conflict: true }; // unique_violation
    throw new Error(`Supabase booking insert failed: ${error.message}`);
  }

  const inserted = rowToJs(data, APPOINTMENT_FIELDS);
  inserted.folio = `BR-${data.folio_number}`;
  return { row: inserted };
}

module.exports = {
  readDb,
  writeDb,
  takeSnapshot,
  insertAppointmentAtomic,
  upsertClientAndGetId,
  markPersisted,
  // exported for tests
  diffCollection,
  fingerprint,
  rowToJs,
  jsToRow,
  COLLECTIONS,
  SERVICE_FIELDS, CLIENT_FIELDS, APPOINTMENT_FIELDS, PROMOTION_FIELDS,
  COURSE_FIELDS, COURSE_REGISTRATION_FIELDS, MEDIA_FIELDS,
  NOTIFICATION_FIELDS, POST_FIELDS, STAFF_FIELDS, CLIENT_PHOTO_FIELDS
};
