// ---------------------------------------------------------------------------
// REPOSITORY LAYER  (EPIC 1 / STORY 2)
//
// Domain modules already never import supabase directly — lib/store.js is the
// only place that knows Postgres exists. What was missing was an explicit,
// named CRUD API, so every route hand-rolled its own `db.services.push(...)`
// / `.findIndex(...)` / `.filter(...)` against raw arrays. That is easy to get
// subtly wrong (forgotten `updatedAt`, off-by-one splices, silent no-op
// updates when an id doesn't match).
//
// Each repository wraps ONE collection and exposes the same small surface:
//
//     find(id) · findBy(pred) · list(pred?) · create(data) · update(id, patch)
//     upsert(data) · remove(id) · removeBy(pred) · count(pred?)
//
// Repositories operate on the in-memory collection held by the db object.
// Persistence is handled by the record-level diff in store.writeDb(): only
// records a repository actually inserted, changed or removed are written.
// Nothing here issues its own SQL, so business logic stays database-agnostic
// and every route keeps working unchanged.
// ---------------------------------------------------------------------------

const { generateId } = require('../helpers');
const { USE_SUPABASE } = require('../config');

class RepositoryError extends Error {
  constructor(message, code = 'REPOSITORY_ERROR') {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

class BaseRepository {
  /**
   * @param {object} db          the in-memory db object from readDb()
   * @param {string} collection  key on db, e.g. 'services'
   * @param {object} opts
   * @param {string} opts.idPrefix    prefix for generated ids, e.g. 'svc'
   * @param {string} opts.counterKey  key in db.counters used for local-mode ids
   * @param {boolean} opts.timestamps whether to maintain createdAt/updatedAt
   * @param {string} opts.label       human name used in error messages
   */
  constructor(db, collection, opts = {}) {
    if (!db) throw new RepositoryError('Repository requires a db instance.');
    if (!Array.isArray(db[collection])) db[collection] = [];
    this.db = db;
    this.collection = collection;
    this.idPrefix = opts.idPrefix || collection.slice(0, 3);
    this.counterKey = opts.counterKey || collection;
    this.timestamps = opts.timestamps !== false;
    this.label = opts.label || collection;
  }

  get items() {
    return this.db[this.collection];
  }

  nextId() {
    if (!this.db.counters) this.db.counters = {};
    this.db.counters[this.counterKey] = (this.db.counters[this.counterKey] || 1000) + 1;
    return generateId(USE_SUPABASE, this.idPrefix, this.db.counters[this.counterKey]);
  }

  find(id) {
    if (id === undefined || id === null) return null;
    return this.items.find(item => item.id === id) || null;
  }

  // Throws instead of returning null. Use where absence is a real error, so a
  // bad id fails loudly at the source rather than as a downstream TypeError.
  findOrFail(id) {
    const found = this.find(id);
    if (!found) throw new RepositoryError(`${this.label} no encontrado.`, 'NOT_FOUND');
    return found;
  }

  findBy(predicate) {
    return this.items.find(predicate) || null;
  }

  list(predicate) {
    return predicate ? this.items.filter(predicate) : [...this.items];
  }

  count(predicate) {
    return predicate ? this.items.filter(predicate).length : this.items.length;
  }

  exists(id) {
    return this.find(id) !== null;
  }

  create(data) {
    const now = new Date().toISOString();
    const record = { ...data };
    if (record.id === undefined || record.id === null) record.id = this.nextId();
    if (this.timestamps) {
      record.createdAt = record.createdAt || now;
      record.updatedAt = now;
    }
    this.items.push(record);
    return record;
  }

  // Returns null when the id doesn't exist, so callers can 404 cleanly rather
  // than silently "succeeding" on a no-op — the old inline code's failure mode.
  update(id, patch) {
    const record = this.find(id);
    if (!record) return null;
    Object.assign(record, patch);
    if (this.timestamps) record.updatedAt = new Date().toISOString();
    return record;
  }

  updateOrFail(id, patch) {
    const updated = this.update(id, patch);
    if (!updated) throw new RepositoryError(`${this.label} no encontrado.`, 'NOT_FOUND');
    return updated;
  }

  upsert(data) {
    if (data.id && this.exists(data.id)) return this.update(data.id, data);
    return this.create(data);
  }

  updateWhere(predicate, patch) {
    const changed = [];
    for (const item of this.items) {
      if (!predicate(item)) continue;
      Object.assign(item, patch);
      if (this.timestamps) item.updatedAt = new Date().toISOString();
      changed.push(item);
    }
    return changed;
  }

  // Returns true only if something was actually removed.
  remove(id) {
    const idx = this.items.findIndex(item => item.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  removeBy(predicate) {
    const before = this.items.length;
    this.db[this.collection] = this.items.filter(item => !predicate(item));
    return before - this.db[this.collection].length;
  }

  clear() {
    const removed = this.items.length;
    this.db[this.collection] = [];
    return removed;
  }
}

// --- Entity repositories -----------------------------------------------------

class ServiceRepository extends BaseRepository {
  constructor(db) {
    super(db, 'services', { idPrefix: 'svc', counterKey: 'service', timestamps: false, label: 'Servicio' });
  }
  active() {
    return this.list(s => s.active);
  }
  byCategory(cat) {
    return this.list(s => s.cat === cat);
  }
}

class ClientRepository extends BaseRepository {
  constructor(db) {
    super(db, 'clients', { idPrefix: 'cli', counterKey: 'client', label: 'Clienta' });
  }
  // WhatsApp is the real-world identity key for a client, not the id.
  byWhatsapp(whatsapp) {
    if (!whatsapp) return null;
    return this.findBy(c => c.whatsapp === whatsapp);
  }
  search(term) {
    if (!term) return this.list();
    const q = String(term).toLowerCase();
    return this.list(c =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.whatsapp || '').includes(q)
    );
  }
}

class AppointmentRepository extends BaseRepository {
  constructor(db) {
    super(db, 'appointments', { idPrefix: 'apt', counterKey: 'appointment', timestamps: false, label: 'Cita' });
  }
  byDate(date) {
    return this.list(a => a.date === date);
  }
  byDateRange(start, end) {
    return this.list(a => a.date >= start && a.date <= end);
  }
  byClient(clientId) {
    return this.list(a => a.clientId === clientId);
  }
  // Cancelled appointments free their slot, so they are excluded here — this
  // mirrors the partial unique index in sql/schema.sql exactly.
  activeAt(date, time) {
    return this.findBy(a => a.date === date && a.time === time && a.status !== 'cancelled');
  }
  isSlotTaken(date, time) {
    return this.activeAt(date, time) !== null;
  }
}

class PromotionRepository extends BaseRepository {
  constructor(db) {
    super(db, 'promotions', { idPrefix: 'promo', counterKey: 'promotion', label: 'Promoción' });
  }
  active() {
    return this.list(p => p.active);
  }
  byCode(code) {
    if (!code) return null;
    const q = String(code).trim().toUpperCase();
    return this.findBy(p => String(p.code || '').toUpperCase() === q);
  }
  incrementUsage(id) {
    const promo = this.find(id);
    if (!promo) return null;
    return this.update(id, { usageCount: (promo.usageCount || 0) + 1 });
  }
}

class NotificationRepository extends BaseRepository {
  constructor(db) {
    super(db, 'notifications', { idPrefix: 'ntf', counterKey: 'notification', label: 'Notificación' });
  }
  unread() {
    return this.list(n => n.unread);
  }
  unreadCount() {
    return this.count(n => n.unread);
  }
  // Newest first — what the admin panel actually wants to render.
  recent(limit = 50) {
    return [...this.items]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit);
  }
  markRead(id) {
    return this.update(id, { unread: false });
  }
  markAllRead() {
    return this.updateWhere(n => n.unread, { unread: false });
  }
}

class GalleryRepository extends BaseRepository {
  constructor(db) {
    super(db, 'media', { idPrefix: 'med', counterKey: 'media', label: 'Elemento de galería' });
  }
  carousel() {
    return this.list(m => m.showInCarousel).sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  gallery() {
    return this.list(m => m.showInGallery).sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  byCategory(category) {
    return this.list(m => m.category === category);
  }
  categories() {
    return [...new Set(this.items.map(m => m.category).filter(Boolean))];
  }
}

class CourseRepository extends BaseRepository {
  constructor(db) {
    super(db, 'courses', { idPrefix: 'crs', counterKey: 'course', label: 'Curso' });
  }
  active() {
    return this.list(c => c.active);
  }
}

class CourseRegistrationRepository extends BaseRepository {
  constructor(db) {
    super(db, 'courseRegistrations', { idPrefix: 'reg', counterKey: 'registration', timestamps: false, label: 'Inscripción' });
  }
  byCourse(courseId) {
    return this.list(r => r.courseId === courseId);
  }
  countForCourse(courseId) {
    return this.count(r => r.courseId === courseId && r.status !== 'cancelled');
  }
}

/**
 * Builds every repository for one request's db object.
 *
 *     const repos = repositories(db);
 *     const svc = repos.services.findOrFail(id);
 *     repos.notifications.markAllRead();
 *     await writeDb(db, salonId);   // diff persists only what changed
 */
function repositories(db) {
  return {
    services: new ServiceRepository(db),
    clients: new ClientRepository(db),
    appointments: new AppointmentRepository(db),
    promotions: new PromotionRepository(db),
    notifications: new NotificationRepository(db),
    gallery: new GalleryRepository(db),
    courses: new CourseRepository(db),
    courseRegistrations: new CourseRegistrationRepository(db)
  };
}

module.exports = {
  repositories,
  RepositoryError,
  BaseRepository,
  ServiceRepository,
  ClientRepository,
  AppointmentRepository,
  PromotionRepository,
  NotificationRepository,
  GalleryRepository,
  CourseRepository,
  CourseRegistrationRepository
};
