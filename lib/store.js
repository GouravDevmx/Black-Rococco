const fs = require('fs');
const supabase = require('./supabaseClient');

// ---------------------------------------------------------------------------
// Generic field-mapping sync engine.
//
// Each collection (clients, services, promotions, ...) is described once:
// which table it lives in, its id field, and a list of [jsKey, sqlColumn]
// pairs. From that one description we can both read rows back into the
// app's existing in-memory JS shape (unchanged from the JSON-file era) and
// write the in-memory array back out as upserts + deletes for anything
// removed. This keeps ~40 existing route handlers, and all the business
// logic (promo engine, availability, stats), completely untouched — they
// still just read/mutate a plain JS object.
// ---------------------------------------------------------------------------

function rowToJs(row, fields) {
  const out = {};
  for (const [jsKey, sqlKey] of fields) {
    out[jsKey] = row[sqlKey];
  }
  return out;
}

function jsToRow(obj, fields, extra) {
  const out = { ...extra };
  for (const [jsKey, sqlKey] of fields) {
    out[sqlKey] = obj[jsKey] === undefined ? null : obj[jsKey];
  }
  return out;
}

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

// Upserts every item currently in memory, and deletes any row that exists
// in the table for this salon but is no longer present in memory (i.e. was
// deleted in the admin UI). Safe to call even if nothing changed.
async function syncCollection(table, salonId, items, fields, idField = 'id') {
  const { data: existingRows, error: fetchErr } = await supabase
    .from(table)
    .select(idField)
    .eq('salon_id', salonId);
  if (fetchErr) throw new Error(`Supabase sync read failed (${table}): ${fetchErr.message}`);

  const existingIds = new Set((existingRows || []).map(r => r[idField]));
  const currentIds = new Set(items.map(item => item[idField]).filter(Boolean));

  const toDelete = [...existingIds].filter(id => !currentIds.has(id));
  if (toDelete.length) {
    const { error: delErr } = await supabase.from(table).delete().eq('salon_id', salonId).in(idField, toDelete);
    if (delErr) throw new Error(`Supabase sync delete failed (${table}): ${delErr.message}`);
  }

  if (items.length) {
    const rows = items.map(item => jsToRow(item, fields, { salon_id: salonId }));
    const { error: upsertErr } = await supabase.from(table).upsert(rows, { onConflict: idField });
    if (upsertErr) throw new Error(`Supabase sync upsert failed (${table}): ${upsertErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// Collection field maps (jsKey <-> sqlColumn). Must match sql/schema.sql.
// ---------------------------------------------------------------------------

const SERVICE_FIELDS = [
  ['id', 'id'], ['cat', 'cat'], ['name', 'name'], ['desc', 'description'],
  ['price', 'price'], ['dur', 'duration_minutes'], ['imageUrl', 'image_url'],
  ['active', 'active'], ['sort', 'sort_order']
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
  ['createdAt', 'created_at']
];
// `folio` is derived from the DB-assigned `folio_number` (bigserial), not a
// real column — never included in the generic field map above, so it's
// never accidentally written or overwritten by the generic sync engine.

const PROMOTION_FIELDS = [
  ['id', 'id'], ['code', 'code'], ['label', 'label'], ['title', 'title'], ['note', 'note'],
  ['type', 'discount_type'], ['value', 'value'], ['scope', 'scope'],
  ['categoryValue', 'category_value'], ['serviceIds', 'service_ids'],
  ['startDate', 'start_date'], ['endDate', 'end_date'], ['active', 'active'],
  ['autoApply', 'auto_apply'], ['usageLimit', 'usage_limit'], ['usageCount', 'usage_count'],
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

const POST_FIELDS = [
  ['id', 'id'], ['caption', 'caption'], ['imageUrl', 'image_url'],
  ['targets', 'targets'], ['publishedAt', 'published_at']
];

// ---------------------------------------------------------------------------
// Public API: readDb(salonId) / writeDb(db, salonId)
// If salonId is null, falls back to the local JSON file (single-salon demo).
// ---------------------------------------------------------------------------

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

  const { data: salonRow, error: salonErr } = await supabase
    .from('salons')
    .select('*')
    .eq('id', salonId)
    .single();
  if (salonErr) throw new Error(`Supabase read failed (salons): ${salonErr.message}`);

  const [services, clients, appointments, promotions, courses, courseRegistrations, media, notifications, posts] = await Promise.all([
    fetchCollection('services', salonId, SERVICE_FIELDS, 'sort_order'),
    fetchCollection('clients', salonId, CLIENT_FIELDS),
    fetchAppointments(salonId),
    fetchCollection('promotions', salonId, PROMOTION_FIELDS),
    fetchCollection('courses', salonId, COURSE_FIELDS, 'sort_order'),
    fetchCollection('course_registrations', salonId, COURSE_REGISTRATION_FIELDS),
    fetchCollection('media', salonId, MEDIA_FIELDS, 'sort_order'),
    fetchCollection('notifications', salonId, NOTIFICATION_FIELDS),
    fetchCollection('posts', salonId, POST_FIELDS)
  ]);

  return {
    settings: {
      brand: salonRow.brand || {},
      contact: salonRow.contact || {},
      booking: salonRow.booking || {},
      featuredServiceIds: salonRow.featured_service_ids || [],
      gallery: [], // superseded by the `media` collection; kept for shape compatibility
      promo: { enabled: false, label: '', title: '', note: '' },
      notifications: {
        adminPanel: true,
        googleCalendar: 'webhook',
        whatsappAdmin: 'webhook',
        clientReminders: [24, 2]
      }
    },
    services,
    clients,
    appointments,
    promotions,
    courses,
    courseRegistrations,
    media,
    notifications,
    posts,
    counters: { appointment: 1000, client: 1000, post: 1000, notification: 1000, promotion: 1000, course: 1000, registration: 1000, service: 1000, media: 1000 }
  };
}

async function writeDb(db, salonId, dbPath) {
  if (!salonId) return writeLocalFile(dbPath, db);

  await Promise.all([
    supabase.from('salons').update({
      brand: db.settings.brand,
      contact: db.settings.contact,
      booking: db.settings.booking,
      featured_service_ids: db.settings.featuredServiceIds || []
    }).eq('id', salonId).then(({ error }) => {
      if (error) throw new Error(`Supabase write failed (salons): ${error.message}`);
    }),
    syncCollection('services', salonId, db.services, SERVICE_FIELDS),
    syncCollection('clients', salonId, db.clients, CLIENT_FIELDS),
    syncCollection('appointments', salonId, db.appointments, APPOINTMENT_FIELDS),
    syncCollection('promotions', salonId, db.promotions, PROMOTION_FIELDS),
    syncCollection('courses', salonId, db.courses, COURSE_FIELDS),
    syncCollection('course_registrations', salonId, db.courseRegistrations, COURSE_REGISTRATION_FIELDS),
    syncCollection('media', salonId, db.media, MEDIA_FIELDS),
    syncCollection('notifications', salonId, db.notifications, NOTIFICATION_FIELDS),
    syncCollection('posts', salonId, db.posts, POST_FIELDS)
  ]);
}

// ---------------------------------------------------------------------------
// The one operation that gets a REAL atomic database guarantee instead of
// going through the generic read-modify-write cycle above: creating a new
// appointment. sql/schema.sql has a partial unique index on
// (salon_id, appt_date, appt_time) WHERE status <> 'cancelled', so Postgres
// itself rejects a double-booked slot even under concurrent requests —
// something an app-level "check then insert" can never fully guarantee.
// Returns the inserted row (with its real id + folio_number) on success, or
// { conflict: true } if the slot was already taken.
async function insertAppointmentAtomic(salonId, appt) {
  const row = jsToRow(appt, APPOINTMENT_FIELDS, { salon_id: salonId });
  delete row.id; // let Postgres generate it

  const { data, error } = await supabase
    .from('appointments')
    .insert(row)
    .select()
    .single();

  if (error) {
    // Postgres unique_violation error code
    if (error.code === '23505') return { conflict: true };
    throw new Error(`Supabase booking insert failed: ${error.message}`);
  }

  const inserted = rowToJs(data, APPOINTMENT_FIELDS);
  inserted.folio = `BR-${data.folio_number}`;
  return { row: inserted };
}

module.exports = {
  readDb,
  writeDb,
  insertAppointmentAtomic,
  // exported for tests
  rowToJs,
  jsToRow,
  SERVICE_FIELDS,
  CLIENT_FIELDS,
  APPOINTMENT_FIELDS,
  PROMOTION_FIELDS,
  COURSE_FIELDS,
  COURSE_REGISTRATION_FIELDS,
  MEDIA_FIELDS,
  NOTIFICATION_FIELDS,
  POST_FIELDS
};
