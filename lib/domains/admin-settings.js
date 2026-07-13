const { writeDb } = require('../db');
const { json, readBody, safeString } = require('../helpers');

// Handles all of Admin → CONFIGURACIÓN saves.
// Each section (brand, contact, booking, config lists, hero images) is saved
// independently via the sub-path, so a failed save in one section never
// overwrites another.
async function handleAdminRoutes({ req, res, pathname, db, salonId }) {
  if (req.method === 'POST' && pathname === '/api/admin/settings/brand') {
    const body = await readBody(req);
    db.settings.brand = {
      ...db.settings.brand,
      name: safeString(body.name, 100) || db.settings.brand.name,
      tagline: safeString(body.tagline, 200),
      heroTitle: safeString(body.heroTitle, 200),
      heroSubtitle: safeString(body.heroSubtitle, 200),
      specialties: safeString(body.specialties, 200),
      rating: safeString(body.rating, 10),
      socialProof: safeString(body.socialProof, 200),
      footer: safeString(body.footer, 200)
    };
    await writeDb(db, salonId);
    json(res, 200, { ok: true, brand: db.settings.brand });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/settings/contact') {
    const body = await readBody(req);
    db.settings.contact = {
      ...db.settings.contact,
      address1: safeString(body.address1, 200),
      address2: safeString(body.address2, 200),
      hours1: safeString(body.hours1, 100),
      hours2: safeString(body.hours2, 100),
      whatsappNumber: safeString(body.whatsappNumber, 30),
      whatsappUrl: body.whatsappNumber ? `https://api.whatsapp.com/send/?phone=${safeString(body.whatsappNumber, 30).replace(/\D/g, '')}` : db.settings.contact.whatsappUrl,
      mapsUrl: safeString(body.mapsUrl, 500),
      instagramUrl: safeString(body.instagramUrl, 500),
      instagramHandle: safeString(body.instagramHandle, 80),
      tiktokUrl: safeString(body.tiktokUrl, 500)
    };
    await writeDb(db, salonId);
    json(res, 200, { ok: true, contact: db.settings.contact });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/settings/booking') {
    const body = await readBody(req);
    db.settings.booking = {
      ...db.settings.booking,
      times: Array.isArray(body.times) ? body.times.filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 24) : db.settings.booking.times,
      confirmNote: safeString(body.confirmNote, 600)
    };
    await writeDb(db, salonId);
    json(res, 200, { ok: true, booking: db.settings.booking });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/settings/config') {
    const body = await readBody(req);
    const parseList = (v) => Array.isArray(v) ? v.map(s => safeString(s, 80)).filter(Boolean) : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : null);
    db.settings.config = {
      ...db.settings.config,
      whatsappNumber: safeString(body.whatsappNumber, 30) || db.settings.config.whatsappNumber,
      colors: parseList(body.colors) || db.settings.config.colors,
      bebidas: parseList(body.bebidas) || db.settings.config.bebidas,
      estilos: parseList(body.estilos) || db.settings.config.estilos,
      serviceCategories: parseList(body.serviceCategories) || db.settings.config.serviceCategories,
      galleryCategories: parseList(body.galleryCategories) || db.settings.config.galleryCategories
    };
    // Keep contact.whatsappNumber in sync
    if (body.whatsappNumber) db.settings.contact = { ...db.settings.contact, whatsappNumber: db.settings.config.whatsappNumber };
    await writeDb(db, salonId);
    json(res, 200, { ok: true, config: db.settings.config });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/settings/hero-images') {
    const body = await readBody(req);
    const images = Array.isArray(body.images) ? body.images.slice(0, 10).map(img => ({
      url: safeString(img.url, 1000),
      title: safeString(img.title, 200),
      subtitle: safeString(img.subtitle, 200)
    })).filter(img => img.url) : [];
    db.settings.config = { ...db.settings.config, heroImages: images };
    await writeDb(db, salonId);
    json(res, 200, { ok: true, heroImages: images });
    return true;
  }

  return false;
}

module.exports = { handleAdminRoutes };
