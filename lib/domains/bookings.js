const { getService } = require('./services');
const { getAvailability, hasOverlap } = require('./availability');
const { resolveBookingPromotion } = require('./promotions');
const { publicAppointment } = require('./appointments');
const { clientPreferences, applyClientProfilePatch } = require('./clients');
const { registerBookingNotifications, dispatchWebhook } = require('./notifications');
const { whatsappBookingUrl, googleCalendarTemplateUrl, clientReminderWhatsAppUrl } = require('./whatsapp');
const { writeDb, insertAppointmentAtomic } = require('../db');
const { json, readBody, safeString, normalizePhone, todayYmd, generateId } = require('../helpers');
const { USE_SUPABASE, STATUS_FLOW } = require('../config');

// Public route: GET /api/availability?date=&serviceId=, POST /api/bookings
async function handlePublicRoutes({ req, res, pathname, url, db, salonId }) {
  if (req.method === 'GET' && pathname === '/api/availability') {
    const date = safeString(url.searchParams.get('date'), 20);
    const serviceId = safeString(url.searchParams.get('serviceId'), 80);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { json(res, 400, { error: 'Valid date is required' }); return true; }
    if (!getService(db, serviceId)) { json(res, 400, { error: 'Valid serviceId is required' }); return true; }
    json(res, 200, { date, serviceId, slots: getAvailability(db, date, serviceId) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/bookings') {
    await createBooking({ req, res, db, salonId });
    return true;
  }

  return false;
}

async function createBooking({ req, res, db, salonId }) {
  const body = await readBody(req);
  const serviceId = safeString(body.serviceId, 80);
  const date = safeString(body.date, 20);
  const time = safeString(body.time, 10);
  const name = safeString(body.name, 120);
  const whatsapp = normalizePhone(body.whatsapp);
  const profilePatch = {
    styleChoice: body.styleChoice,
    colorChoice: body.colorChoice,
    drinkChoice: body.drinkChoice,
    timePreference: body.timePreference,
    notes: body.notes,
    allergies: body.allergies
  };
  const service = getService(db, serviceId);

  if (!service || !service.active) return json(res, 400, { error: 'Selecciona un servicio válido.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Selecciona una fecha válida.' });
  if (!db.settings.booking.times.includes(time)) return json(res, 400, { error: 'Selecciona un horario válido.' });
  if (date < todayYmd()) return json(res, 400, { error: 'No se pueden reservar fechas pasadas.' });
  if (name.length < 2) return json(res, 400, { error: 'Escribe tu nombre.' });
  if (whatsapp.length < 8) return json(res, 400, { error: 'Escribe un WhatsApp válido.' });
  if (hasOverlap(db, date, time, serviceId)) return json(res, 409, { error: 'Ese horario acaba de ocuparse. Elige otro horario.' });

 let client;

if (USE_SUPABASE) {
  const supabase = require('../supabaseClient'); // adjust path if needed

  // STEP 1: find client in Supabase
  let { data: existingClient } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp', whatsapp)
    .maybeSingle();

  if (!existingClient) {
    // STEP 2: create client in Supabase
    let { data: newClient, error } = await supabase
      .from('clients')
     .insert([{
  name,
  whatsapp,
  salon_id: salonId
}])
      .select()
      .single();

    if (error) {
      console.error("Supabase client create error:", error);
      return json(res, 500, { error: "Error creando cliente" });
    }

    client = newClient;
  } else {
    client = existingClient;
  }

} else {
  // LOCAL MODE (unchanged)
  client = db.clients.find(c => normalizePhone(c.whatsapp) === whatsapp);

  if (!client) {
    db.counters.client += 1;
    client = {
      id: generateId(USE_SUPABASE, 'cli', db.counters.client),
      name,
      whatsapp,
      email: '',
      instagram: '',
      birthday: '',
      styleChoice: '',
      colorChoice: '',
      drinkChoice: '',
      timePreference: '',
      notes: '',
      allergies: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    applyClientProfilePatch(client, profilePatch, { allowIdentity: false, onlyNonEmpty: true });
    db.clients.push(client);
  } else {
    if (client.name !== name) client.name = name;
    applyClientProfilePatch(client, profilePatch, { allowIdentity: false, onlyNonEmpty: true });
  }
}

  const promoResolution = resolveBookingPromotion(db, service, body.promoCode);
  if (promoResolution.error) return json(res, 400, { error: promoResolution.error });

  db.counters.appointment += 1;
  const apptDraft = {
    id: generateId(USE_SUPABASE, 'apt', db.counters.appointment),
    folio: `BR-${db.counters.appointment}`,
    clientId: client.id,
    serviceId,
    date,
    time,
    status: 'new',
    preferencesSnapshot: clientPreferences(client),
    finalPrice: promoResolution.promo ? promoResolution.finalPrice : service.price,
    appliedPromotion: promoResolution.promo ? {
      id: promoResolution.promo.id,
      code: promoResolution.promo.code,
      label: promoResolution.promo.label,
      type: promoResolution.promo.type,
      value: promoResolution.promo.value,
      discountAmount: promoResolution.discountAmount,
      originalPrice: service.price
    } : null,
    remindersSent: {},
    createdAt: new Date().toISOString()
  };

  let appt;
  if (USE_SUPABASE) {
    // Real, atomic, database-enforced double-booking protection: the
    // hasOverlap() check above is a fast, friendly pre-check, but this
    // insert is what actually guarantees correctness under concurrent
    // requests (sql/schema.sql has a unique index on
    // salon_id+appt_date+appt_time for non-cancelled bookings).
    const inserted = await insertAppointmentAtomic(salonId, apptDraft);
    if (inserted.conflict) return json(res, 409, { error: 'Ese horario acaba de ocuparse. Elige otro horario.' });
    appt = inserted.row;
  } else {
    appt = apptDraft;
  }
  db.appointments.push(appt);

  if (promoResolution.promo) promoResolution.promo.usageCount = (promoResolution.promo.usageCount || 0) + 1;
  const dispatches = registerBookingNotifications(db, appt);
  await writeDb(db, salonId);
  for (const d of dispatches) dispatchWebhook(salonId, d.notificationId, d.webhookUrl, d.payload);

  return json(res, 201, {
    appointment: publicAppointment(db, appt),
    whatsappUrl: whatsappBookingUrl(db, appt),
    addToCalendarUrl: googleCalendarTemplateUrl(db, appt),
    clientReminderUrl: clientReminderWhatsAppUrl(db, appt),
    note: db.settings.booking.confirmNote
  });
}

// Admin route: advance/set an appointment's status (new -> confirmed -> ... -> completed, or cancelled).
async function handleAdminRoutes({ req, res, pathname, db, salonId }) {
  const apptStatusMatch = pathname.match(/^\/api\/admin\/appointments\/([^/]+)\/status$/);
  if (req.method === 'PATCH' && apptStatusMatch) {
    const appt = db.appointments.find(a => a.id === apptStatusMatch[1]);
    if (!appt) { json(res, 404, { error: 'Cita no encontrada.' }); return true; }
    const body = await readBody(req);
    const next = safeString(body.status, 30) || STATUS_FLOW[(STATUS_FLOW.indexOf(appt.status) + 1) % STATUS_FLOW.length];
    if (![...STATUS_FLOW, 'cancelled'].includes(next)) { json(res, 400, { error: 'Estado inválido.' }); return true; }
    appt.status = next;
    await writeDb(db, salonId);
    json(res, 200, { appointment: publicAppointment(db, appt) });
    return true;
  }
  return false;
}

module.exports = { handlePublicRoutes, createBooking, handleAdminRoutes };
