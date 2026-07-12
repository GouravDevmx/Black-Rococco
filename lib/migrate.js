const { cleanDateStringLoose } = require('./helpers');
const { CLIENT_REMINDER_HOURS } = require('./config');

// Normalizes/fills-in defaults for every collection in the in-memory db
// object. Runs on every readDb() call, both local-JSON and Supabase modes.
// If something looks malformed or a field is unexpectedly missing/wrong
// type somewhere in the app, this is usually the first place to check.
function migrateDb(db) {
  db.settings = db.settings || {};
  db.settings.notifications = db.settings.notifications || {
    adminPanel: true,
    googleCalendar: 'webhook',
    whatsappAdmin: 'webhook',
    clientReminders: CLIENT_REMINDER_HOURS
  };
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.counters = db.counters || {};
  db.counters.appointment = Number(db.counters.appointment || 1000);
  db.counters.client = Number(db.counters.client || 1000);
  db.counters.post = Number(db.counters.post || 1000);
  db.counters.notification = Number(db.counters.notification || 1000);
  db.appointments = Array.isArray(db.appointments) ? db.appointments : [];
  db.posts = Array.isArray(db.posts) ? db.posts : [];
  for (const appt of db.appointments) {
    appt.remindersSent = appt.remindersSent || {};
    appt.preferencesSnapshot = appt.preferencesSnapshot || {};
  }
  db.clients = (Array.isArray(db.clients) ? db.clients : []).map(client => ({
    ...client,
    email: client.email || '',
    instagram: client.instagram || '',
    birthday: client.birthday || '',
    styleChoice: client.styleChoice || '',
    colorChoice: client.colorChoice || '',
    drinkChoice: client.drinkChoice || '',
    timePreference: client.timePreference || '',
    notes: client.notes || '',
    allergies: client.allergies || '',
    updatedAt: client.updatedAt || client.createdAt || new Date().toISOString()
  }));

  db.counters.promotion = Number(db.counters.promotion || 1000);
  db.counters.course = Number(db.counters.course || 1000);
  db.counters.registration = Number(db.counters.registration || 1000);
  db.counters.service = Number(db.counters.service || 1000);
  db.services = (db.services || []).map(s => ({
    ...s,
    imageUrl: s.imageUrl || '',
    sort: Number(s.sort) || 0
  }));
  db.promotions = Array.isArray(db.promotions) ? db.promotions : [];
  db.promotions = db.promotions.map(p => ({
    id: p.id,
    code: (p.code || '').trim().toUpperCase(),
    label: p.label || '',
    title: p.title || '',
    note: p.note || '',
    type: p.type === 'fixed' ? 'fixed' : 'percent',
    value: Math.max(0, Number(p.value) || 0),
    scope: ['all', 'category', 'services'].includes(p.scope) ? p.scope : 'all',
    categoryValue: p.categoryValue || '',
    serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds : [],
    startDate: cleanDateStringLoose(p.startDate),
    endDate: cleanDateStringLoose(p.endDate),
    active: p.active !== false,
    autoApply: p.autoApply !== false,
    usageLimit: Math.max(0, Number(p.usageLimit) || 0),
    usageCount: Math.max(0, Number(p.usageCount) || 0),
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || p.createdAt || new Date().toISOString()
  }));

  db.courses = Array.isArray(db.courses) ? db.courses : [];
  db.courses = db.courses.map(c => {
    let imageUrls = Array.isArray(c.imageUrls) ? c.imageUrls.filter(Boolean) : [];
    if (!imageUrls.length && c.imageUrl) imageUrls = [c.imageUrl];
    return {
      id: c.id,
      title: c.title || '',
      description: c.description || '',
      price: Math.max(0, Number(c.price) || 0),
      duration: c.duration || '',
      level: c.level || '',
      imageUrls,
      capacity: Math.max(0, Number(c.capacity) || 0),
      startDate: cleanDateStringLoose(c.startDate),
      active: c.active !== false,
      sort: Number(c.sort) || 0,
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || c.createdAt || new Date().toISOString()
    };
  });

  db.courseRegistrations = Array.isArray(db.courseRegistrations) ? db.courseRegistrations : [];
  for (const reg of db.courseRegistrations) {
    reg.status = reg.status || 'new';
    reg.notes = reg.notes || '';
  }

  db.counters.media = Number(db.counters.media || 1000);
  if (!Array.isArray(db.media)) {
    // One-time migration: seed the media library from legacy settings.gallery
    // entries and previously uploaded posts, so no existing photos are lost
    // on upgrade. Only ever runs in local-JSON mode (Supabase mode always
    // returns a real array from the media table).
    const seeded = [];
    let order = 10;
    for (const g of db.settings?.gallery || []) {
      if (!g.imageUrl) continue;
      db.counters.media += 1;
      seeded.push({
        id: `media_${db.counters.media}`,
        kind: 'image',
        url: g.imageUrl,
        posterUrl: '',
        title: g.title || '',
        description: '',
        category: '',
        order,
        showInCarousel: true,
        showInGallery: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      order += 10;
    }
    for (const p of db.posts || []) {
      if (!p.imageUrl) continue;
      db.counters.media += 1;
      seeded.push({
        id: `media_${db.counters.media}`,
        kind: 'image',
        url: p.imageUrl,
        posterUrl: '',
        title: p.caption || '',
        description: '',
        category: '',
        order,
        showInCarousel: (p.targets || []).includes('galeria'),
        showInGallery: (p.targets || []).includes('galeria'),
        createdAt: p.publishedAt || new Date().toISOString(),
        updatedAt: p.publishedAt || new Date().toISOString()
      });
      order += 10;
    }
    db.media = seeded;
  }
  db.media = db.media.map(m => ({
    id: m.id,
    kind: m.kind === 'video' ? 'video' : 'image',
    url: m.url || '',
    posterUrl: m.posterUrl || '',
    title: m.title || '',
    description: m.description || '',
    category: m.category || '',
    order: Number(m.order) || 0,
    showInCarousel: m.showInCarousel !== false,
    showInGallery: m.showInGallery !== false,
    createdAt: m.createdAt || new Date().toISOString(),
    updatedAt: m.updatedAt || m.createdAt || new Date().toISOString()
  })).filter(m => m.url);

  return db;
}

module.exports = { migrateDb };
