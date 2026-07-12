const app = document.getElementById('app');

const state = {
  mode: 'client',
  tab: 'inicio',
  config: null,
  services: [],
  groupedServices: {},
  promotions: [],
  courses: [],
  media: { gallery: [], carousel: [], categories: [] },
  serviceModalId: null,
  lightbox: null,
  galleryFilter: '',
  galleryVisibleCount: 9,
  galleryFilteredCache: [],
  homeCarouselCache: [],
  booking: {
    step: 1,
    serviceId: null,
    date: null,
    time: null,
    name: '',
    whatsapp: '',
    styleChoice: '',
    colorChoice: '',
    drinkChoice: '',
    timePreference: '',
    allergies: '',
    notes: '',
    promoCode: '',
    loadingSlots: false,
    slots: [],
    error: '',
    success: null
  },
  admin: {
    loggedIn: false,
    email: '',
    password: '',
    tab: 'agenda',
    selectedClientId: null,
    editingPromoId: null,
    editingCourseId: null,
    editingServiceId: null,
    editingMediaId: null,
    mediaDraft: null,
    mediaUploading: false,
    courseImageDraft: [],
    courseImageUploading: false,
    googleCalendar: null,
    data: null,
    error: ''
  },
  academia: {
    selectedCourseId: null,
    name: '',
    whatsapp: '',
    email: '',
    notes: '',
    imageIndex: {},
    error: '',
    success: null
  }
};

const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value || 0);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
// In multi-tenant SaaS mode, the salon is resolved server-side from a
// subdomain, a query param (?salon=slug), or this header — in that priority
// order (see lib/tenant.js). Reading it once here and sending it as a
// header means the query param only needs to be in the URL on first load;
// it isn't required on every internal SPA navigation afterwards.
const SALON_SLUG = new URLSearchParams(location.search).get('salon') || '';

const api = (url, options = {}) => fetch(url, {
  headers: {
    'Content-Type': 'application/json',
    ...(SALON_SLUG ? { 'X-Salon-Slug': SALON_SLUG } : {}),
    ...(options.headers || {})
  },
  credentials: 'same-origin',
  ...options,
  body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
}).then(async res => {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Ocurrió un error.');
  return payload;
});

function setHashMode() {
  const hash = location.hash.replace('#', '');
  if (hash === 'admin') state.mode = 'admin';
  if (['inicio', 'servicios', 'reservar', 'galeria', 'academia'].includes(hash)) {
    state.mode = 'client';
    state.tab = hash;
  }
}

function splitBrand(name) {
  const parts = String(name || 'BLACK ROCOCO').split(' ');
  if (parts.length <= 1) return [name, ''];
  return [parts[0], parts.slice(1).join(' ')];
}

function serviceById(id) {
  return state.services.find(s => s.id === id);
}

function clientById(id) {
  return (state.admin.data?.clients || []).find(c => c.id === id);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function profileSummary(c = {}) {
  const parts = [];
  if (c.styleChoice) parts.push(`Estilo: ${c.styleChoice}`);
  if (c.colorChoice) parts.push(`Color: ${c.colorChoice}`);
  if (c.drinkChoice) parts.push(`Bebida: ${c.drinkChoice}`);
  if (c.timePreference) parts.push(`Horario: ${c.timePreference}`);
  return parts.length ? parts.join(' · ') : 'Sin preferencias registradas';
}

function whatsappChatUrl(message = 'Hola Black Rococo, quiero información para agendar una cita ✨') {
  const base = state.config?.contact?.whatsappUrl || 'https://api.whatsapp.com/send/?phone=5213326553522';
  const phone = (base.match(/phone=([^&]+)/) || [])[1] || '5213326553522';
  return `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}`;
}

function whatsappTo(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `521${digits}`;
  return `https://api.whatsapp.com/send/?phone=${digits}&text=${encodeURIComponent(message)}`;
}

function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dateOptions() {
  const days = [];
  const dayNames = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ymd = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    days.push({ ymd, day: dayNames[d.getDay()], num: d.getDate() });
  }
  return days;
}

function goClient(tab) {
  state.mode = 'client';
  state.tab = tab;
  history.replaceState(null, '', `#${tab}`);
  render();
}

function goAdmin() {
  state.mode = 'admin';
  history.replaceState(null, '', '#admin');
  checkAdmin().then(render);
}

function startBooking(serviceId = null) {
  state.mode = 'client';
  state.tab = 'reservar';
  state.booking.step = serviceId ? 2 : 1;
  state.booking.serviceId = serviceId;
  state.booking.date = state.booking.date || todayLocal();
  state.booking.time = null;
  state.booking.error = '';
  state.booking.success = null;
  history.replaceState(null, '', '#reservar');
  if (serviceId) loadAvailability();
  render();
}

async function loadInitial() {
  setHashMode();
  const data = await api('/api/config');
  state.config = data.settings;
  state.services = data.services;
  state.groupedServices = data.groupedServices;
  state.promotions = data.promotions || [];
  state.courses = data.courses || [];
  state.media = data.media || { gallery: [], carousel: [], categories: [] };
  state.booking.date = todayLocal();
  if (state.mode === 'admin') {
    await checkAdmin();
    if (new URLSearchParams(location.search).has('gcal')) {
      state.admin.tab = 'integraciones';
      if (state.admin.loggedIn) loadGoogleCalendarStatus();
    }
  }
  render();
}

async function checkAdmin() {
  try {
    const me = await api('/api/admin/me');
    state.admin.loggedIn = Boolean(me.loggedIn);
    if (me.loggedIn) await loadAdminDashboard();
  } catch (_) {
    state.admin.loggedIn = false;
  }
}

async function loadAvailability() {
  const { serviceId, date } = state.booking;
  if (!serviceId || !date) return;
  state.booking.loadingSlots = true;
  state.booking.error = '';
  render();
  try {
    const data = await api(`/api/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`);
    state.booking.slots = data.slots;
  } catch (err) {
    state.booking.error = err.message;
  } finally {
    state.booking.loadingSlots = false;
    render();
  }
}

async function createBooking() {
  state.booking.error = '';
  render();
  const { serviceId, date, time, name, whatsapp, styleChoice, colorChoice, drinkChoice, timePreference, allergies, notes, promoCode } = state.booking;
  try {
    const data = await api('/api/bookings', {
      method: 'POST',
      body: { serviceId, date, time, name, whatsapp, styleChoice, colorChoice, drinkChoice, timePreference, allergies, notes, promoCode }
    });
    state.booking.success = data;
    state.booking.step = 4;
    if (state.admin.loggedIn) await loadAdminDashboard();
  } catch (err) {
    state.booking.error = err.message;
  }
  render();
}

async function adminLogin() {
  state.admin.error = '';
  render();
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: { email: state.admin.email, password: state.admin.password }
    });
    state.admin.loggedIn = true;
    await loadAdminDashboard();
  } catch (err) {
    state.admin.error = err.message;
  }
  render();
}

async function adminLogout() {
  await api('/api/admin/logout', { method: 'POST' });
  state.admin.loggedIn = false;
  state.admin.data = null;
  render();
}

async function loadAdminDashboard() {
  state.admin.data = await api('/api/admin/dashboard');
}

async function cycleStatus(id, current) {
  const order = ['new', 'confirmed', 'in_progress', 'completed'];
  const next = order[(order.indexOf(current) + 1) % order.length] || 'new';
  await api(`/api/admin/appointments/${id}/status`, { method: 'PATCH', body: { status: next } });
  await loadAdminDashboard();
  render();
}

async function markNotificationRead(id) {
  await api(`/api/admin/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
  await loadAdminDashboard();
  render();
}

async function markAllNotificationsRead() {
  await api('/api/admin/notifications/read-all', { method: 'POST' });
  await loadAdminDashboard();
  render();
}

async function updateClientProfile(form) {
  const clientId = form.dataset.clientProfileForm;
  const body = Object.fromEntries(new FormData(form).entries());
  state.admin.error = '';
  try {
    await api(`/api/admin/clients/${encodeURIComponent(clientId)}`, { method: 'PATCH', body });
    await loadAdminDashboard();
    state.admin.selectedClientId = clientId;
  } catch (err) {
    state.admin.error = err.message;
  }
  render();
}

async function updateService(id, patch) {
  await api(`/api/admin/services/${id}`, { method: 'PATCH', body: patch });
  const cfg = await api('/api/config');
  state.services = cfg.services;
  state.groupedServices = cfg.groupedServices;
  await loadAdminDashboard();
  render();
}

async function uploadAdminImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/admin/uploads', {
    method: 'POST',
    credentials: 'same-origin',
    headers: SALON_SLUG ? { 'X-Salon-Slug': SALON_SLUG } : {},
    body: fd
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'No se pudo subir la imagen.');
  return payload.imageUrl;
}

async function uploadAdminMediaFile(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/admin/uploads', {
    method: 'POST',
    credentials: 'same-origin',
    headers: SALON_SLUG ? { 'X-Salon-Slug': SALON_SLUG } : {},
    body: fd
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'No se pudo subir el archivo.');
  return { url: payload.url || payload.imageUrl, kind: payload.kind || 'image' };
}

async function createPost(form) {
  const caption = form.querySelector('[name="caption"]').value;
  const file = form.querySelector('[name="imageFile"]')?.files?.[0];
  const targets = [...form.querySelectorAll('[name="target"]:checked')].map(el => el.value);
  try {
    let imageUrl = '';
    if (file) imageUrl = await uploadAdminImage(file);
    await api('/api/admin/posts', { method: 'POST', body: { caption, imageUrl, targets } });
    form.reset();
    await refreshPublicConfig();
    await loadAdminDashboard();
    render();
  } catch (err) {
    state.admin.error = err.message;
    render();
  }
}

async function refreshPublicConfig() {
  const cfg = await api('/api/config');
  state.config = cfg.settings;
  state.services = cfg.services;
  state.groupedServices = cfg.groupedServices;
  state.promotions = cfg.promotions || [];
  state.courses = cfg.courses || [];
  state.media = cfg.media || { gallery: [], carousel: [], categories: [] };
}

function selectCourse(id) {
  state.academia.selectedCourseId = id;
  state.academia.error = '';
  render();
}

async function submitCourseRegistration() {
  const ac = state.academia;
  ac.error = '';
  render();
  try {
    const data = await api('/api/course-registrations', {
      method: 'POST',
      body: { courseId: ac.selectedCourseId, name: ac.name, whatsapp: ac.whatsapp, email: ac.email, notes: ac.notes }
    });
    ac.success = data;
    if (state.admin.loggedIn) await loadAdminDashboard();
  } catch (err) {
    ac.error = err.message;
  }
  render();
}

async function createOrUpdatePromotion(form) {
  const editingId = form.dataset.promoForm;
  const fd = new FormData(form);
  const body = {
    label: fd.get('label') || '',
    code: fd.get('code') || '',
    title: fd.get('title') || '',
    note: fd.get('note') || '',
    type: fd.get('type') || 'percent',
    value: Number(fd.get('value') || 0),
    scope: fd.get('scope') || 'all',
    categoryValue: fd.get('categoryValue') || '',
    serviceIds: fd.getAll('serviceIds'),
    startDate: fd.get('startDate') || '',
    endDate: fd.get('endDate') || '',
    usageLimit: Number(fd.get('usageLimit') || 0),
    autoApply: fd.get('autoApply') === 'on',
    active: fd.get('active') === 'on'
  };
  try {
    if (editingId) {
      await api(`/api/admin/promotions/${encodeURIComponent(editingId)}`, { method: 'PATCH', body });
    } else {
      await api('/api/admin/promotions', { method: 'POST', body });
    }
    state.admin.editingPromoId = null;
    await refreshPublicConfig();
    await loadAdminDashboard();
  } catch (err) {
    state.admin.error = err.message;
  }
  render();
}

async function togglePromotion(id, current) {
  await api(`/api/admin/promotions/${encodeURIComponent(id)}`, { method: 'PATCH', body: { active: current !== '1' } });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function deletePromotion(id) {
  if (!confirm('¿Eliminar esta promoción?')) return;
  await api(`/api/admin/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function handleCourseImageFilesSelected(input) {
  const files = [...(input.files || [])];
  if (!files.length) return;
  state.admin.courseImageUploading = true;
  render();
  try {
    for (const file of files) {
      const url = await uploadAdminImage(file);
      state.admin.courseImageDraft.push(url);
    }
  } catch (err) {
    state.admin.error = err.message;
  }
  state.admin.courseImageUploading = false;
  input.value = '';
  render();
}

function removeCourseDraftImage(index) {
  state.admin.courseImageDraft.splice(Number(index), 1);
  render();
}

async function createOrUpdateCourse(form) {
  const editingId = form.dataset.courseForm;
  const fd = new FormData(form);
  const body = {
    title: fd.get('title') || '',
    description: fd.get('description') || '',
    price: Number(fd.get('price') || 0),
    duration: fd.get('duration') || '',
    level: fd.get('level') || '',
    imageUrls: [...state.admin.courseImageDraft],
    capacity: Number(fd.get('capacity') || 0),
    startDate: fd.get('startDate') || '',
    active: fd.get('active') === 'on'
  };
  try {
    if (editingId) {
      await api(`/api/admin/courses/${encodeURIComponent(editingId)}`, { method: 'PATCH', body });
    } else {
      await api('/api/admin/courses', { method: 'POST', body });
    }
    state.admin.editingCourseId = null;
    state.admin.courseImageDraft = [];
    await refreshPublicConfig();
    await loadAdminDashboard();
  } catch (err) {
    state.admin.error = err.message;
  }
  render();
}

async function toggleCourse(id, current) {
  await api(`/api/admin/courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: { active: current !== '1' } });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function deleteCourse(id) {
  if (!confirm('¿Eliminar este curso? También se perderán sus inscripciones.')) return;
  await api(`/api/admin/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function createOrUpdateService(form) {
  const editingId = form.dataset.serviceForm;
  const file = form.querySelector('[name="imageFile"]')?.files?.[0];
  const fd = new FormData(form);
  try {
    let imageUrl = fd.get('existingImageUrl') || '';
    if (file) imageUrl = await uploadAdminImage(file);
    const body = {
      name: fd.get('name') || '',
      cat: fd.get('cat') || '',
      dur: Number(fd.get('dur') || 60),
      desc: fd.get('desc') || '',
      price: Number(fd.get('price') || 0),
      sort: Number(fd.get('sort') || 0),
      imageUrl,
      active: fd.get('active') === 'on',
      featured: fd.get('featured') === 'on'
    };
    if (editingId) {
      await api(`/api/admin/services/${encodeURIComponent(editingId)}`, { method: 'PATCH', body });
    } else {
      await api('/api/admin/services', { method: 'POST', body });
    }
    state.admin.editingServiceId = null;
    await refreshPublicConfig();
    await loadAdminDashboard();
  } catch (err) {
    state.admin.error = err.message;
  }
  render();
}

async function toggleFeaturedService(id, current) {
  await api(`/api/admin/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: { featured: current !== '1' } });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function deleteServiceEntry(id) {
  if (!confirm('¿Eliminar este servicio? Ya no aparecerá en el sitio.')) return;
  await api(`/api/admin/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function handleMediaFileSelected(input) {
  const file = input.files?.[0];
  if (!file) return;
  state.admin.mediaUploading = true;
  render();
  try {
    const uploaded = await uploadAdminMediaFile(file);
    state.admin.mediaDraft = uploaded;
  } catch (err) {
    state.admin.error = err.message;
  }
  state.admin.mediaUploading = false;
  input.value = '';
  render();
}

function clearMediaDraft() {
  state.admin.mediaDraft = null;
  render();
}

async function createOrUpdateMedia(form) {
  const editingId = form.dataset.mediaForm;
  const draft = state.admin.mediaDraft;
  if (!draft?.url) {
    state.admin.error = 'Sube una foto o video primero.';
    return render();
  }
  const fd = new FormData(form);
  const body = {
    url: draft.url,
    kind: draft.kind || 'image',
    title: fd.get('title') || '',
    description: fd.get('description') || '',
    category: fd.get('category') || '',
    order: Number(fd.get('order') || 0),
    showInCarousel: fd.get('showInCarousel') === 'on',
    showInGallery: fd.get('showInGallery') === 'on'
  };
  try {
    if (editingId) {
      await api(`/api/admin/media/${encodeURIComponent(editingId)}`, { method: 'PATCH', body });
    } else {
      await api('/api/admin/media', { method: 'POST', body });
    }
    state.admin.editingMediaId = null;
    state.admin.mediaDraft = null;
    await refreshPublicConfig();
    await loadAdminDashboard();
  } catch (err) {
    state.admin.error = err.message;
  }
  render();
}

async function toggleMediaFlag(id, field, value) {
  await api(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'PATCH', body: { [field]: value } });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function deleteMediaEntry(id) {
  if (!confirm('¿Eliminar este elemento de la galería?')) return;
  await api(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refreshPublicConfig();
  await loadAdminDashboard();
  render();
}

async function updateCourseRegistrationStatus(id, status) {
  await api(`/api/admin/course-registrations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
  await loadAdminDashboard();
  render();
}

function topSwitch() {
  return `<div class="top-switch">
    <div class="demo-label">MVP FUNCIONAL</div>
    <div class="pill-row">
      <button class="pill-button ${state.mode === 'client' ? 'active' : ''}" data-action="client">CLIENTE</button>
      <button class="pill-button ${state.mode === 'admin' ? 'active' : ''}" data-action="admin">ADMIN</button>
    </div>
  </div>`;
}

function brandHeader() {
  const [one, two] = splitBrand(state.config.brand.name);
  return `<header class="brand-header">
    <div class="gold-rule"></div>
    <div class="logo">${esc(one)}<br>${esc(two)}</div>
    <div class="tagline">${esc(state.config.brand.tagline)}</div>
    <div class="gold-rule"></div>
    <div class="social-proof"><strong>★ ${esc(state.config.brand.rating)}</strong> · ${esc(state.config.brand.socialProof)}</div>
  </header>`;
}

function promoBanner() {
  const promos = state.promotions || [];
  if (promos.length) {
    const p = promos[0];
    return `<div class="section"><div class="card promo-card"><div class="eyebrow">${esc(p.label || 'PROMOCIÓN')}</div><div class="title" style="font-size:22px;margin:6px 0">${esc(p.title)}</div><div class="subtitle">${esc(p.note)}</div><button class="btn btn-primary" style="margin-top:14px" data-tab="reservar">APARTAR MI LUGAR</button></div></div>`;
  }
  const legacy = state.config?.promo;
  if (legacy?.enabled) {
    return `<div class="section"><div class="card promo-card"><div class="eyebrow">${esc(legacy.label)}</div><div class="title" style="font-size:22px;margin:6px 0">${esc(legacy.title)}</div><div class="subtitle">${esc(legacy.note)}</div><button class="btn btn-primary" style="margin-top:14px" data-tab="reservar">APARTAR MI LUGAR</button></div></div>`;
  }
  return '';
}

function featuredServiceCarouselCard(s) {
  return `<button class="carousel-service-card" data-book="${esc(s.id)}">
    ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="${esc(s.name)}" loading="lazy">` : `<div class="carousel-service-fallback"></div>`}
    <div class="carousel-service-caption">
      <div class="cap-title">${esc(s.name)}</div>
      <div class="cap-desc">${esc(s.desc)}</div>
      <div class="cap-price">${priceDisplay(s)}</div>
    </div>
  </button>`;
}

function featuredServicesCarousel() {
  const items = (state.config.featuredServiceIds || [])
    .map(id => serviceById(id))
    .filter(Boolean);
  if (!items.length) return `<div class="empty">Aún no hay servicios destacados.</div>`;
  const cards = items.map(featuredServiceCarouselCard).join('');
  const looped = items.length > 1;
  return `<div class="auto-carousel-track" data-auto-carousel>${cards}${looped ? cards : ''}</div>`;
}

function mediaThumbCard(m, index, listName) {
  const isVideo = m.kind === 'video';
  return `<div class="image-card" data-open-lightbox="${index}" data-lightbox-list="${listName}">
    ${isVideo
      ? `<video src="${esc(m.url)}" muted loop playsinline poster="${esc(m.posterUrl || '')}"></video>`
      : `<img alt="${esc(m.title || 'Resultado Black Rococo')}" src="${esc(m.url)}" loading="lazy">`}
    ${(m.title || m.description) ? `<div class="masonry-caption"><div class="cap-title">${esc(m.title)}</div>${m.description ? `<div class="cap-desc">${esc(m.description)}</div>` : ''}</div>` : ''}
  </div>`;
}

function openLightbox(items, index) {
  if (!items || !items.length) return;
  state.lightbox = { items, index: ((index % items.length) + items.length) % items.length };
  render();
}

function closeLightbox() {
  state.lightbox = null;
  render();
}

function lightboxNext() {
  if (!state.lightbox) return;
  const n = state.lightbox.items.length;
  state.lightbox.index = (state.lightbox.index + 1) % n;
  render();
}

function lightboxPrev() {
  if (!state.lightbox) return;
  const n = state.lightbox.items.length;
  state.lightbox.index = (state.lightbox.index - 1 + n) % n;
  render();
}

function lightboxOverlay() {
  const lb = state.lightbox;
  if (!lb) return '';
  const item = lb.items[lb.index];
  if (!item) return '';
  const isVideo = item.kind === 'video';
  return `<div class="lightbox-overlay" data-close-lightbox data-lightbox-container>
    <button class="lightbox-close" data-close-lightbox aria-label="Cerrar">✕</button>
    ${lb.items.length > 1 ? `
      <button class="lightbox-arrow left" data-lightbox-prev aria-label="Anterior">‹</button>
      <button class="lightbox-arrow right" data-lightbox-next aria-label="Siguiente">›</button>
      <div class="lightbox-counter">${lb.index + 1} / ${lb.items.length}</div>
    ` : ''}
    <div class="lightbox-media">
      ${isVideo ? `<video src="${esc(item.url)}" controls autoplay playsinline></video>` : `<img src="${esc(item.url)}" alt="${esc(item.title || '')}">`}
    </div>
    ${(item.title || item.description) ? `<div class="lightbox-caption"><div class="cap-title" style="font-size:16px">${esc(item.title)}</div>${item.description ? `<div class="cap-desc" style="font-size:13px;margin-top:4px">${esc(item.description)}</div>` : ''}</div>` : ''}
  </div>`;
}

function promoAppliesToServiceClient(promo, service) {
  if (promo.scope === 'all') return true;
  if (promo.scope === 'category') return promo.categoryValue === service.cat;
  if (promo.scope === 'services') return (promo.serviceIds || []).includes(service.id);
  return false;
}

function discountedPriceFor(service) {
  const candidates = (state.promotions || []).filter(p => promoAppliesToServiceClient(p, service));
  if (!candidates.length) return null;
  const withAmount = candidates.map(p => ({
    promo: p,
    amount: p.type === 'fixed' ? Math.min(service.price, p.value) : Math.round(service.price * (p.value / 100))
  })).sort((a, b) => b.amount - a.amount);
  const best = withAmount[0];
  if (!best.amount) return null;
  return { finalPrice: Math.max(0, service.price - best.amount), amount: best.amount, promo: best.promo };
}

function priceDisplay(s) {
  const discount = discountedPriceFor(s);
  if (!discount) return `$ ${esc(s.price)}`;
  return `<span class="price-was">$ ${esc(s.price)}</span> $ ${esc(discount.finalPrice)}`;
}

function serviceDetailModal() {
  const s = serviceById(state.serviceModalId);
  if (!s) return '';
  const discount = discountedPriceFor(s);
  return `<div class="modal-overlay" data-close-service-modal>
    <div class="modal-card">
      <button class="modal-close" data-close-service-modal aria-label="Cerrar">✕</button>
      ${s.imageUrl ? `<div class="modal-image"><img src="${esc(s.imageUrl)}" alt="${esc(s.name)}" loading="lazy"></div>` : ''}
      <div class="modal-body">
        <div class="category-title">${esc(s.cat)}</div>
        <div class="service-name" style="font-size:22px;margin:6px 0">${esc(s.name)}</div>
        <div class="service-meta" style="margin-bottom:10px">${esc(s.dur)} min</div>
        <p class="subtitle">${esc(s.desc)}</p>
        <div class="price" style="font-size:26px;margin:16px 0 6px">${priceDisplay(s)}</div>
        ${discount ? `<div class="service-meta">${esc(discount.promo.label || 'Promoción aplicada')}</div>` : ''}
        <button class="btn btn-primary" style="margin-top:16px;width:100%" data-book-from-modal="${esc(s.id)}">RESERVAR ESTE SERVICIO</button>
      </div>
    </div>
  </div>`;
}

function serviceButton(s, detailed = false) {
  if (detailed) {
    return `<div class="card service-detail" data-view-service="${esc(s.id)}">
      ${s.imageUrl ? `<div class="service-thumb"><img src="${esc(s.imageUrl)}" alt="${esc(s.name)}" loading="lazy"></div>` : ''}
      <div class="top">
        <div>
          <div class="service-name">${esc(s.name)}</div>
          <div class="service-meta">${esc(s.dur)} min · <span class="link-hint">Ver detalles</span></div>
        </div>
        <div class="price">${priceDisplay(s)}</div>
      </div>
      <button class="btn btn-outline btn-small" data-book="${esc(s.id)}">RESERVAR</button>
    </div>`;
  }
  return `<button class="card service-card" data-book="${esc(s.id)}">
    <span>
      <span class="service-name">${esc(s.name)}</span>
      <span class="service-meta">${esc(s.dur)} min</span>
    </span>
    <span class="price">${priceDisplay(s)}</span>
  </button>`;
}

function homeScreen() {
  const c = state.config;
  const openSlots = Math.max(0, (state.booking.slots.length ? state.booking.slots : c.booking.times.map(t => ({ busy: false }))).filter(s => !s.busy).length);
  const carouselMedia = (state.media?.carousel || []).slice(0, 10);
  state.homeCarouselCache = carouselMedia;
  return `<section class="screen">
    ${brandHeader()}
    <div class="hero">
      <div class="hero-art">Foto principal<br>agrega imagen real en producción</div>
      <div class="hero-overlay">
        <div class="hero-title">${esc(c.brand.heroTitle)}</div>
        <div class="hero-subtitle">${esc(c.brand.heroSubtitle)}</div>
      </div>
    </div>
    <div class="section-tight cta-row">
      <button class="btn btn-primary" data-tab="reservar">RESERVA TU CITA</button>
      <div class="fomo"><span class="dot"></span><span>${openSlots} horarios libres hoy — la agenda se llena rápido</span></div>
    </div>
    <div class="specialties"><span class="line"></span><div class="eyebrow">ESPECIALISTAS EN<br><span>${esc(c.brand.specialties)}</span></div><span class="line"></span></div>
    <div class="section">
      <div class="section-head"><div class="title">Resultados reales</div><button class="pill-button" data-tab="galeria">VER GALERÍA →</button></div>
      <div class="carousel">
        ${carouselMedia.length
          ? carouselMedia.map((m, i) => mediaThumbCard(m, i, 'homeCarousel')).join('')
          : `<div class="image-card"><div class="placeholder">Aún no hay fotos<br>sube fotos reales en Admin → GALERÍA</div></div>`}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><div><div class="title">Servicios destacados</div><div class="subtitle">Los favoritos de nuestras clientas</div></div></div>
      ${featuredServicesCarousel()}
      <button class="btn btn-outline" style="margin-top:12px" data-tab="servicios">VER TODOS LOS SERVICIOS</button>
    </div>
    <div class="section" style="text-align:center">
      <div class="eyebrow" style="padding-bottom:14px">SÍGUENOS</div>
      <div class="pill-row" style="justify-content:center">
        <a class="pill-button" target="_blank" rel="noopener" href="${esc(c.contact.instagramUrl)}">INSTAGRAM</a>
        <a class="pill-button" target="_blank" rel="noopener" href="${esc(c.contact.tiktokUrl)}">TIKTOK</a>
      </div>
    </div>
    ${promoBanner()}
    ${(state.courses || []).length ? `<div class="section"><div class="card promo-card" style="border-color:var(--gold, #b08d57)"><div class="eyebrow">BLACK ROCOCO ACADEMY</div><div class="title" style="font-size:22px;margin:6px 0">Cursos y talleres profesionales</div><div class="subtitle">Certifícate en poligel, manicure ruso y más.</div><button class="btn btn-outline" style="margin-top:14px" data-tab="academia">VER CURSOS</button></div></div>` : ''}
    <div class="section">
      <div class="card info-grid">
        <div class="info-line"><strong>Dirección</strong><span>${esc(c.contact.address1)}<br>${esc(c.contact.address2)}</span></div>
        <div class="info-line"><strong>Horario</strong><span>${esc(c.contact.hours1)}<br>${esc(c.contact.hours2)}</span></div>
        <div class="pill-row">
          <a class="pill-button" target="_blank" rel="noopener" href="${esc(c.contact.mapsUrl)}">VER MAPA</a>
          <a class="pill-button" target="_blank" rel="noopener" href="${esc(whatsappChatUrl())}">WHATSAPP</a>
        </div>
      </div>
    </div>
    <div class="footer">${esc(c.brand.footer)}</div>
    ${bottomNav()}
  </section>`;
}

function servicesScreen() {
  const groups = Object.entries(state.groupedServices || {});
  return `<section class="screen">
    ${brandHeader()}
    <div class="page-header"><div class="title">Servicios y precios</div><div class="subtitle">Selecciona cualquier servicio para reservar.</div></div>
    <div class="section-tight">
      ${groups.map(([cat, list]) => `<div class="category-title">${esc(cat)}</div><div class="card-list">${list.map(s => serviceButton(s, true)).join('')}</div>`).join('')}
    </div>
    ${bottomNav()}
  </section>`;
}

function bookingScreen() {
  const b = state.booking;
  if (b.success) return bookingSuccess();
  return `<section class="screen">
    ${brandHeader()}
    <div class="page-header"><div class="title">Reservar</div><div class="subtitle">Elige servicio, horario y confirma tus datos.</div></div>
    <div class="progress"><span class="${b.step >= 1 ? 'active' : ''}"></span><span class="${b.step >= 2 ? 'active' : ''}"></span><span class="${b.step >= 3 ? 'active' : ''}"></span></div>
    ${b.step === 1 ? bookingStepService() : ''}
    ${b.step === 2 ? bookingStepTime() : ''}
    ${b.step === 3 ? bookingStepConfirm() : ''}
    ${bottomNav()}
  </section>`;
}

function bookingStepService() {
  const groups = Object.entries(state.groupedServices || {});
  return `<div class="booking-step">
    <div class="section-head"><div><div class="title">1. Servicio</div><div class="subtitle">¿Qué te quieres hacer?</div></div></div>
    ${groups.map(([cat, list]) => `<div class="category-title">${esc(cat)}</div><div class="card-list">${list.map(s => `<button class="card service-card selectable ${state.booking.serviceId === s.id ? 'active' : ''}" data-select-service="${esc(s.id)}"><span><span class="service-name">${esc(s.name)}</span><span class="service-meta">${esc(s.dur)} min · ${esc(s.desc)}</span></span><span class="price">$ ${esc(s.price)}</span></button>`).join('')}</div>`).join('')}
  </div>`;
}

function bookingStepTime() {
  const b = state.booking;
  const svc = serviceById(b.serviceId);
  const dates = dateOptions();
  const free = b.slots.filter(s => !s.busy).length;
  return `<div class="booking-step">
    <div class="section-head"><div><div class="title">2. Fecha y hora</div><div class="subtitle">${esc(svc?.name || '')} · ${svc ? money(svc.price) : ''}</div></div><button class="pill-button" data-step="1">CAMBIAR</button></div>
    <div class="date-row">${dates.map(d => `<button class="date-chip ${b.date === d.ymd ? 'active' : ''}" data-date="${d.ymd}"><b>${d.day}</b><span>${d.num}</span></button>`).join('')}</div>
    <div class="form-field compact-field"><label>Otra fecha</label><input type="date" min="${todayLocal()}" value="${esc(b.date)}" data-booking-date-input></div>
    <div class="fomo" style="justify-content:flex-start;padding:0 0 10px"><span class="dot"></span><span>${free ? `QUEDAN ${free} HORARIOS` : 'SIN HORARIOS DISPONIBLES'} · los horarios ocupados se bloquean automáticamente</span></div>
    ${b.loadingSlots ? `<div class="empty">Cargando horarios…</div>` : `<div class="time-grid">${b.slots.map(s => `<button class="time-btn ${b.time === s.time ? 'active' : ''} ${s.busy ? 'busy' : ''}" ${s.busy ? 'disabled aria-disabled="true"' : ''} data-time="${s.time}"><span>${s.time}</span>${s.busy ? '<small>Ocupado</small>' : '<small>Libre</small>'}</button>`).join('')}</div>`}
    ${b.error ? `<div class="error-box">${esc(b.error)}</div>` : ''}
    <button class="btn btn-primary" style="margin-top:16px" data-step="3" ${!b.time ? 'disabled' : ''}>CONTINUAR</button>
  </div>`;
}

function bookingStepConfirm() {
  const b = state.booking;
  const svc = serviceById(b.serviceId);
  const discount = svc ? discountedPriceFor(svc) : null;
  return `<div class="booking-step">
    <div class="section-head"><div><div class="title">3. Confirmar</div><div class="subtitle">Revisa tus datos antes de apartar tu lugar.</div></div><button class="pill-button" data-step="2">CAMBIAR</button></div>
    <div class="card info-grid" style="margin-bottom:16px">
      <div class="info-line"><strong>Servicio</strong><span>${esc(svc?.name || '')}</span></div>
      <div class="info-line"><strong>Fecha</strong><span>${esc(b.date)}</span></div>
      <div class="info-line"><strong>Hora</strong><span>${esc(b.time)}</span></div>
      <div class="info-line"><strong>Total</strong><span>${svc ? priceDisplay(svc) : ''}</span></div>
      ${discount ? `<div class="info-line"><strong>Promoción</strong><span>${esc(discount.promo.label || 'Descuento aplicado')}</span></div>` : ''}
    </div>
    <div class="form-grid two-col">
      <div class="form-field"><label>Nombre</label><input value="${esc(b.name)}" data-field="name" placeholder="Tu nombre"></div>
      <div class="form-field"><label>WhatsApp</label><input value="${esc(b.whatsapp)}" data-field="whatsapp" inputmode="tel" placeholder="33 0000 0000"></div>
    </div>
    <div class="form-field"><label>¿Tienes un código de promoción?</label><input value="${esc(b.promoCode)}" data-field="promoCode" placeholder="Opcional, ej. VERANO15" style="text-transform:uppercase"></div>
    <div class="card preference-card">
      <div class="section-head compact-head"><div><div class="title">Perfil de clienta</div><div class="subtitle">Opcional: esto ayuda al salón a recordar tus gustos para próximas visitas.</div></div></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Estilo preferido</label><input value="${esc(b.styleChoice)}" data-field="styleChoice" placeholder="Natural, elegante, french, largo, corto..."></div>
        <div class="form-field"><label>Color favorito</label><input value="${esc(b.colorChoice)}" data-field="colorChoice" placeholder="Nude, rojo, negro, rosa..."></div>
        <div class="form-field"><label>Bebida preferida</label><input value="${esc(b.drinkChoice)}" data-field="drinkChoice" placeholder="Café, té, agua mineral..."></div>
        <div class="form-field"><label>Horario preferido</label><input value="${esc(b.timePreference)}" data-field="timePreference" placeholder="Mañana, después de comer, sábado..."></div>
      </div>
      <div class="form-field"><label>Alergias o cuidados</label><input value="${esc(b.allergies)}" data-field="allergies" placeholder="Ej. piel sensible, alergia a algún producto"></div>
      <div class="form-field"><label>Nota para tu cita</label><textarea data-field="notes" rows="3" placeholder="Idea de diseño, ocasión especial, referencia, etc.">${esc(b.notes)}</textarea></div>
    </div>
    ${b.error ? `<div class="error-box">${esc(b.error)}</div>` : ''}
    <button class="btn btn-primary" data-confirm-booking>CONFIRMAR CITA</button>
  </div>`;
}

function bookingSuccess() {
  const data = state.booking.success;
  const a = data.appointment;
  return `<section class="screen">
    <div class="success">
      <div>
        <div class="check">✓</div>
        <div class="eyebrow">CITA APARTADA</div>
        <div class="folio">${esc(a.folio)}</div>
        <div class="subtitle">${esc(a.serviceName)}<br>${esc(a.date)} · ${esc(a.time)}</div>
        ${a.appliedPromotion ? `<div class="card promo-card" style="margin:14px 0"><div class="eyebrow">${esc(a.appliedPromotion.label || 'PROMOCIÓN APLICADA')}</div><div class="subtitle">Precio original ${money(a.originalServicePrice)} → pagas ${money(a.servicePrice)}</div></div>` : `<div class="subtitle" style="margin:10px 0">Total: ${money(a.servicePrice)}</div>`}
        <p class="subtitle" style="margin:18px 0">${esc(data.note)}</p>
        <div class="success-actions">
          <a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(data.whatsappUrl)}">CONFIRMAR POR WHATSAPP</a>
          <a class="btn btn-outline" target="_blank" rel="noopener" href="${esc(data.addToCalendarUrl || a.googleCalendarUrl || '#')}">AGREGAR A MI CALENDARIO</a>
          <button class="btn btn-outline" data-reset-booking>NUEVA CITA</button>
        </div>
        <div class="reminder-note">Te enviaremos recordatorio si la automatización de WhatsApp está conectada. También puedes guardar la cita en tu calendario.</div>
      </div>
    </div>
    ${bottomNav()}
  </section>`;
}

function galleryScreen() {
  const all = state.media?.gallery || [];
  const categories = state.media?.categories || [];
  const filter = state.galleryFilter || '';
  const filtered = filter ? all.filter(m => m.category === filter) : all;
  state.galleryFilteredCache = filtered;
  const visibleCount = state.galleryVisibleCount || 9;
  const visible = filtered.slice(0, visibleCount);
  return `<section class="screen">
    ${brandHeader()}
    <div class="page-header"><div class="title">Galería</div><div class="subtitle">Resultados reales de nuestras clientas.</div></div>
    ${categories.length ? `<div class="pill-row" style="padding:0 16px 10px;flex-wrap:wrap">
      <button class="pill-button ${!filter ? 'active' : ''}" data-gallery-filter="">TODAS</button>
      ${categories.map(cat => `<button class="pill-button ${filter === cat ? 'active' : ''}" data-gallery-filter="${esc(cat)}">${esc(cat)}</button>`).join('')}
    </div>` : ''}
    <div class="masonry-grid">
      ${visible.length ? visible.map((m, i) => masonryItem(m, i)).join('') : `<div class="empty">Aún no hay fotos ${filter ? 'en esta categoría' : 'en la galería'}.</div>`}
    </div>
    ${visible.length < filtered.length ? `<div class="section" style="text-align:center"><button class="btn btn-outline" data-load-more-gallery>CARGAR MÁS</button></div>` : ''}
    <div class="section"><a class="btn btn-outline" target="_blank" rel="noopener" href="${esc(state.config.contact.instagramUrl)}">VER ${esc(state.config.contact.instagramHandle)} EN INSTAGRAM</a></div>
    ${bottomNav()}
  </section>`;
}

function masonryItem(m, index) {
  const isVideo = m.kind === 'video';
  return `<div class="masonry-item" data-open-lightbox="${index}" data-lightbox-list="gallery">
    ${m.category ? `<span class="masonry-category-chip">${esc(m.category)}</span>` : ''}
    ${isVideo
      ? `<video src="${esc(m.url)}" muted loop playsinline poster="${esc(m.posterUrl || '')}"></video>`
      : `<img src="${esc(m.url)}" alt="${esc(m.title || 'Resultado Black Rococo')}" loading="lazy">`}
    ${(m.title || m.description) ? `<div class="masonry-caption"><div class="cap-title">${esc(m.title)}</div>${m.description ? `<div class="cap-desc">${esc(m.description)}</div>` : ''}</div>` : ''}
  </div>`;
}

function courseById(id) {
  return (state.courses || []).find(c => c.id === id);
}

function courseImageCarousel(course) {
  const images = Array.isArray(course.imageUrls) ? course.imageUrls.filter(Boolean) : [];
  if (!images.length) return '';
  const idx = ((state.academia.imageIndex[course.id] || 0) % images.length + images.length) % images.length;
  return `<div class="carousel-frame">
    <img src="${esc(images[idx])}" alt="${esc(course.title)}" loading="lazy">
    ${images.length > 1 ? `
      <button class="carousel-arrow left" data-carousel-prev="${esc(course.id)}" aria-label="Foto anterior">‹</button>
      <button class="carousel-arrow right" data-carousel-next="${esc(course.id)}" aria-label="Foto siguiente">›</button>
      <div class="carousel-dots">${images.map((_, i) => `<span class="dot ${i === idx ? 'active' : ''}"></span>`).join('')}</div>
    ` : ''}
  </div>`;
}

function academiaScreen() {
  const ac = state.academia;
  if (ac.success) return academiaSuccessScreen();
  const courses = state.courses || [];
  const selected = ac.selectedCourseId ? courseById(ac.selectedCourseId) : null;
  return `<section class="screen">
    ${brandHeader()}
    <div class="page-header"><div class="title">Black Rococo Academy</div><div class="subtitle">Cursos y talleres profesionales de manicure y nail art.</div></div>
    <div class="section-tight">
      ${courses.length ? `<div class="card-list">${courses.map(c => `<div class="card service-detail">
        ${courseImageCarousel(c)}
        <div class="top">
          <div>
            <div class="service-name">${esc(c.title)}</div>
            <p>${esc(c.description)}</p>
            <div class="service-meta">${esc(c.duration)}${c.level ? ` · ${esc(c.level)}` : ''}${c.startDate ? ` · Próxima fecha: ${esc(formatDate(c.startDate))}` : ''}${c.capacity ? ` · Cupo: ${esc(c.capacity)}` : ''}</div>
          </div>
          <div class="price">${money(c.price)}</div>
        </div>
        <button class="btn btn-outline btn-small" data-select-course="${esc(c.id)}">INSCRIBIRME</button>
      </div>`).join('')}</div>` : `<div class="empty">Muy pronto anunciaremos nuevos cursos. Síguenos en Instagram para no perderte la fecha.</div>`}
    </div>
    ${selected ? `<div class="card preference-card" style="margin:0 16px 20px">
      <div class="section-head compact-head"><div><div class="title">Inscripción: ${esc(selected.title)}</div><div class="subtitle">Te contactaremos por WhatsApp para confirmar tu lugar.</div></div><button class="pill-button" data-cancel-course-select>CANCELAR</button></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Nombre</label><input value="${esc(ac.name)}" data-academia-field="name" placeholder="Tu nombre"></div>
        <div class="form-field"><label>WhatsApp</label><input value="${esc(ac.whatsapp)}" data-academia-field="whatsapp" inputmode="tel" placeholder="33 0000 0000"></div>
      </div>
      <div class="form-field"><label>Email (opcional)</label><input value="${esc(ac.email)}" data-academia-field="email" placeholder="tu@correo.com"></div>
      <div class="form-field"><label>Comentarios (opcional)</label><textarea data-academia-field="notes" rows="3" placeholder="Experiencia previa, dudas, etc.">${esc(ac.notes)}</textarea></div>
      ${ac.error ? `<div class="error-box">${esc(ac.error)}</div>` : ''}
      <button class="btn btn-primary" data-confirm-course-registration>CONFIRMAR INSCRIPCIÓN</button>
    </div>` : ''}
    ${bottomNav()}
  </section>`;
}

function academiaSuccessScreen() {
  const data = state.academia.success;
  return `<section class="screen">
    <div class="success">
      <div>
        <div class="check">✓</div>
        <div class="eyebrow">INSCRIPCIÓN RECIBIDA</div>
        <div class="subtitle" style="margin:18px 0">${esc(data.note)}</div>
        <div class="success-actions">
          <a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(data.whatsappUrl)}">CONFIRMAR POR WHATSAPP</a>
          <button class="btn btn-outline" data-reset-academia>VER MÁS CURSOS</button>
        </div>
      </div>
    </div>
    ${bottomNav()}
  </section>`;
}

function bottomNav() {
  const tabs = [
    ['inicio', 'INICIO'],
    ['servicios', 'SERVICIOS'],
    ['reservar', 'RESERVAR'],
    ['academia', 'ACADEMIA'],
    ['galeria', 'GALERÍA']
  ];
  return `<a class="wa-float" target="_blank" rel="noopener" href="${esc(whatsappChatUrl())}" aria-label="Chatear por WhatsApp">WhatsApp</a><nav class="bottom-nav">${tabs.map(([id, label]) => `<button class="bottom-tab ${state.tab === id ? 'active' : ''}" data-tab="${id}"><span>${label}</span><span class="nav-dot"></span></button>`).join('')}</nav>`;
}

function adminScreen() {
  if (!state.admin.loggedIn) return adminLoginScreen();
  const data = state.admin.data;
  return `<section class="admin-screen">
    <div class="admin-panel-head">
      <div><div class="title">Hola, Admin</div><div class="subtitle">Agenda del ${esc(data?.date || '')}</div></div>
      <button class="pill-button" data-logout>SALIR</button>
    </div>
    <div class="stats">
      <div class="card"><div class="eyebrow">CITAS HOY</div><div class="stat-number">${esc(data?.count || 0)}</div></div>
      <div class="card"><div class="eyebrow">INGRESO EST.</div><div class="stat-number">${money(data?.estimatedIncome || 0)}</div></div>
      <div class="card"><div class="eyebrow">NOTIFICACIONES</div><div class="stat-number">${esc(data?.unreadNotifications || 0)}</div></div>
    </div>
    <div class="pill-row admin-tabs">
      ${[['agenda','AGENDA'],['notificaciones',`NOTIFICACIONES${data?.unreadNotifications ? ` (${data.unreadNotifications})` : ''}`],['servicios','SERVICIOS'],['promociones','PROMOCIONES'],['clientas','CLIENTAS'],['academia','ACADEMIA'],['galeria','GALERÍA'],['publicar','PUBLICAR'],['integraciones','INTEGRACIONES']].map(([id,label]) => `<button class="pill-button ${state.admin.tab === id ? 'active' : ''}" data-admin-tab="${id}">${label}</button>`).join('')}
    </div>
    ${state.admin.error ? `<div class="error-box">${esc(state.admin.error)}</div>` : ''}
    ${state.admin.tab === 'agenda' ? adminAgenda(data) : ''}
    ${state.admin.tab === 'notificaciones' ? adminNotifications(data) : ''}
    ${state.admin.tab === 'servicios' ? adminServices(data) : ''}
    ${state.admin.tab === 'promociones' ? adminPromotions(data) : ''}
    ${state.admin.tab === 'clientas' ? adminClients(data) : ''}
    ${state.admin.tab === 'academia' ? adminAcademia(data) : ''}
    ${state.admin.tab === 'galeria' ? adminGallery(data) : ''}
    ${state.admin.tab === 'publicar' ? adminPublish(data) : ''}
    ${state.admin.tab === 'integraciones' ? adminIntegrations() : ''}
  </section>`;
}

function adminLoginScreen() {
  const [one, two] = splitBrand(state.config?.brand?.name || 'BLACK ROCOCO');
  return `<section class="admin-login">
    <div class="gold-rule"></div>
    <div class="logo" style="margin:10px 0 4px">${esc(one)}<br>${esc(two)}</div>
    <div class="tagline">PANEL ADMINISTRATIVO</div>
    <div class="card" style="width:100%;margin-top:28px;text-align:left">
      <div class="form-field"><label>Correo</label><input data-admin-field="email" value="${esc(state.admin.email)}" placeholder="admin@blackrococo.mx"></div>
      <div class="form-field"><label>Contraseña</label><input data-admin-field="password" value="${esc(state.admin.password)}" type="password" placeholder="rococo2026"></div>
      ${state.admin.error ? `<div class="error-box">${esc(state.admin.error)}</div>` : ''}
      <button class="btn btn-dark" data-admin-login>ENTRAR</button>
    </div>
    <button class="pill-button" style="margin-top:18px" data-action="client">VOLVER AL SITIO</button>
  </section>`;
}

function adminAgenda(data) {
  const list = data?.appointments || [];
  return `<div class="card-list">
    ${list.length ? list.map(a => `<div class="appt-row">
      <div class="appt-main"><div class="appt-time">${esc(a.time)}</div><button class="status-chip ${esc(a.status)}" data-cycle-status="${esc(a.id)}" data-current-status="${esc(a.status)}">${esc(a.statusLabel)}</button></div>
      <div class="service-name">${esc(a.clientName)}</div>
      <div class="service-meta">${esc(a.serviceName)} · ${money(a.servicePrice)} · ${esc(a.clientWhatsapp)}</div>
      <div class="row-actions">
        <a class="mini-action" target="_blank" rel="noopener" href="${esc(a.adminWhatsappUrl)}">WhatsApp Admin</a>
        <a class="mini-action" target="_blank" rel="noopener" href="${esc(a.googleCalendarUrl)}">Google Calendar</a>
        <a class="mini-action" target="_blank" rel="noopener" href="${esc(a.clientReminderUrl)}">Recordar clienta</a>
      </div>
    </div>`).join('') : `<div class="empty">No hay citas para hoy.</div>`}
  </div>`;
}

function notificationStatusLabel(status) {
  const labels = {
    unread: 'NUEVA',
    queued: 'ENVIANDO',
    sent: 'ENVIADO',
    failed: 'FALLÓ',
    setup_required: 'FALTA CONFIGURAR'
  };
  return labels[status] || String(status || '').toUpperCase();
}

function adminNotifications(data) {
  const list = data?.notifications || [];
  const i = data?.integrations || {};
  return `<div class="card-list notifications-list">
    <div class="card integration-card">
      <div class="section-head compact-head"><div><div class="title">Centro de notificaciones</div><div class="subtitle">Nueva agenda, Google Calendar, WhatsApp Admin y recordatorios de clientas.</div></div>${data?.unreadNotifications ? `<button class="pill-button" data-mark-all-notifications>MARCAR TODO LEÍDO</button>` : ''}</div>
      <div class="integration-grid">
        <div><b>Google Calendar</b><span>${i.googleCalendarConfigured ? 'Conectado por webhook' : 'Pendiente: GOOGLE_CALENDAR_WEBHOOK_URL'}</span></div>
        <div><b>WhatsApp Admin</b><span>${i.whatsappAdminConfigured ? 'Conectado por webhook' : 'Pendiente: WHATSAPP_ADMIN_WEBHOOK_URL'}</span></div>
        <div><b>Recordatorios clienta</b><span>${i.clientReminderConfigured ? `Activo ${esc((i.reminderHours || []).join(', '))} h antes` : 'Pendiente: CLIENT_REMINDER_WEBHOOK_URL'}</span></div>
      </div>
    </div>
    ${list.length ? list.map(n => `<div class="notification-row ${n.unread ? 'unread' : ''}">
      <div class="notification-top"><div class="service-name">${esc(n.title)}</div><span class="notify-status ${esc(n.status)}">${esc(notificationStatusLabel(n.status))}</span></div>
      <div class="service-meta">${esc(n.message)}</div>
      <div class="service-meta">${esc(n.channel)} · ${new Date(n.createdAt).toLocaleString('es-MX')}</div>
      <div class="row-actions">
        ${n.actionUrl ? `<a class="mini-action" target="_blank" rel="noopener" href="${esc(n.actionUrl)}">${esc(n.actionLabel || 'Abrir')}</a>` : ''}
        ${n.unread ? `<button class="mini-action" data-mark-notification="${esc(n.id)}">Marcar leída</button>` : ''}
      </div>
      ${n.error ? `<div class="error-box">${esc(n.error)}</div>` : ''}
    </div>`).join('') : `<div class="empty">No hay notificaciones todavía.</div>`}
  </div>`;
}


function adminServices(data) {
  const services = data?.services || [];
  const categories = [...new Set(services.map(s => s.cat))];
  const featuredIds = data?.featuredServiceIds || [];
  const editing = state.admin.editingServiceId ? services.find(s => s.id === state.admin.editingServiceId) : null;
  return `<div class="card-list">
    <form class="card" data-service-form="${editing ? esc(editing.id) : ''}">
      <div class="eyebrow">${editing ? 'EDITAR SERVICIO' : 'NUEVO SERVICIO'}</div>
      <div class="form-field"><label>Nombre</label><input name="name" value="${esc(editing?.name || '')}" placeholder="Ej. Baño de acrílico"></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Categoría</label><input name="cat" list="service-categories" value="${esc(editing?.cat || '')}" placeholder="MANOS, PIES, EXTRAS..."></div>
        <datalist id="service-categories">${categories.map(cat => `<option value="${esc(cat)}">`).join('')}</datalist>
        <div class="form-field"><label>Duración (min)</label><input type="number" min="5" name="dur" value="${esc(editing?.dur ?? 60)}"></div>
      </div>
      <div class="form-field"><label>Descripción</label><textarea name="desc" rows="2" placeholder="Descripción breve para clientas...">${esc(editing?.desc || '')}</textarea></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Precio</label><input type="number" min="0" name="price" value="${esc(editing?.price ?? 0)}"></div>
        <div class="form-field"><label>Orden (menor = primero)</label><input type="number" name="sort" value="${esc(editing?.sort ?? 0)}"></div>
      </div>
      <div class="form-field"><label>Foto del servicio (opcional)</label><input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
      ${editing?.imageUrl ? `<img src="${esc(editing.imageUrl)}" alt="" class="admin-thumb" style="margin-bottom:10px">` : ''}
      <input type="hidden" name="existingImageUrl" value="${esc(editing?.imageUrl || '')}">
      <label class="pill-button" style="margin-bottom:8px"><input type="checkbox" name="active" ${(!editing || editing.active) ? 'checked' : ''}> Activo (visible en el sitio)</label>
      <label class="pill-button" style="margin-bottom:12px"><input type="checkbox" name="featured" ${editing && featuredIds.includes(editing.id) ? 'checked' : ''}> Destacado (aparece en el carrusel de inicio)</label>
      <div class="row-actions">
        <button class="btn btn-primary" type="submit">${editing ? 'GUARDAR CAMBIOS' : 'CREAR SERVICIO'}</button>
        ${editing ? `<button type="button" class="pill-button" data-cancel-service-edit>CANCELAR</button>` : ''}
      </div>
    </form>
    ${services.map(s => `<div class="admin-service-row">
      <div class="admin-service-main">
        <div><div class="service-name">${esc(s.name)}${featuredIds.includes(s.id) ? ' ★' : ''}</div><div class="service-meta">${esc(s.cat)} · ${esc(s.dur)} min · ${s.active ? 'Activo' : 'Pausado'}</div></div>
        <button class="toggle ${s.active ? 'active' : ''}" data-toggle-service="${esc(s.id)}" data-active="${s.active ? '1' : '0'}"><span></span></button>
      </div>
      <div class="admin-service-main">
        <div class="price">${money(s.price)}</div>
        <div class="price-stepper"><button class="icon-btn" data-price-step="${esc(s.id)}" data-delta="-10">−</button><button class="icon-btn" data-price-step="${esc(s.id)}" data-delta="10">+</button></div>
      </div>
      ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="" class="admin-thumb" style="margin-top:8px">` : ''}
      <div class="row-actions">
        <button class="mini-action" data-edit-service="${esc(s.id)}">Editar</button>
        <button class="mini-action" data-toggle-featured-service="${esc(s.id)}" data-featured="${featuredIds.includes(s.id) ? '1' : '0'}">${featuredIds.includes(s.id) ? 'Quitar de destacados' : 'Destacar'}</button>
        <button class="mini-action" data-delete-service="${esc(s.id)}">Eliminar</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function adminPromotions(data) {
  const promos = data?.promotions || [];
  const services = data?.services || [];
  const categories = [...new Set(services.map(s => s.cat))];
  const editing = state.admin.editingPromoId ? promos.find(p => p.id === state.admin.editingPromoId) : null;
  return `<div class="card-list">
    <form class="card" data-promo-form="${editing ? esc(editing.id) : ''}">
      <div class="eyebrow">${editing ? 'EDITAR PROMOCIÓN' : 'NUEVA PROMOCIÓN'}</div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Etiqueta</label><input name="label" value="${esc(editing?.label || '')}" placeholder="SOLO ESTA SEMANA"></div>
        <div class="form-field"><label>Código (opcional)</label><input name="code" value="${esc(editing?.code || '')}" placeholder="VERANO15"></div>
      </div>
      <div class="form-field"><label>Título</label><input name="title" value="${esc(editing?.title || '')}" placeholder="-15% en tu primera aplicación de poligel"></div>
      <div class="form-field"><label>Nota</label><input name="note" value="${esc(editing?.note || '')}" placeholder="Cupo limitado, menciona la promo al confirmar..."></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Tipo</label><select name="type">
          <option value="percent" ${(!editing || editing.type === 'percent') ? 'selected' : ''}>Porcentaje %</option>
          <option value="fixed" ${editing?.type === 'fixed' ? 'selected' : ''}>Monto fijo $</option>
        </select></div>
        <div class="form-field"><label>Valor</label><input name="value" type="number" min="0" value="${esc(editing?.value ?? 15)}"></div>
      </div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Aplica a</label><select name="scope">
          <option value="all" ${(!editing || editing.scope === 'all') ? 'selected' : ''}>Todos los servicios</option>
          <option value="category" ${editing?.scope === 'category' ? 'selected' : ''}>Una categoría</option>
          <option value="services" ${editing?.scope === 'services' ? 'selected' : ''}>Servicios específicos</option>
        </select></div>
        <div class="form-field"><label>Categoría (si aplica)</label><select name="categoryValue">
          <option value="">—</option>
          ${categories.map(cat => `<option value="${esc(cat)}" ${editing?.categoryValue === cat ? 'selected' : ''}>${esc(cat)}</option>`).join('')}
        </select></div>
      </div>
      <div class="form-field"><label>Servicios específicos (si aplica)</label>
        <div class="pill-row">
          ${services.map(s => `<label class="pill-button"><input type="checkbox" name="serviceIds" value="${esc(s.id)}" ${editing?.serviceIds?.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}
        </div>
      </div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Fecha inicio (opcional)</label><input type="date" name="startDate" value="${esc(editing?.startDate || '')}"></div>
        <div class="form-field"><label>Fecha fin (opcional)</label><input type="date" name="endDate" value="${esc(editing?.endDate || '')}"></div>
      </div>
      <div class="form-field"><label>Límite de usos (0 = ilimitado)</label><input type="number" min="0" name="usageLimit" value="${esc(editing?.usageLimit ?? 0)}"></div>
      <div class="pill-row" style="margin:12px 0">
        <label class="pill-button"><input type="checkbox" name="autoApply" ${(!editing || editing.autoApply) ? 'checked' : ''}> Auto-aplicar (sin código)</label>
        <label class="pill-button"><input type="checkbox" name="active" ${(!editing || editing.active) ? 'checked' : ''}> Activa</label>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary" type="submit">${editing ? 'GUARDAR CAMBIOS' : 'CREAR PROMOCIÓN'}</button>
        ${editing ? `<button type="button" class="pill-button" data-cancel-promo-edit>CANCELAR</button>` : ''}
      </div>
    </form>
    ${promos.length ? promos.map(p => `<div class="admin-service-row">
      <div class="admin-service-main">
        <div><div class="service-name">${esc(p.title)}${p.code ? ` · ${esc(p.code)}` : ''}</div><div class="service-meta">${p.type === 'fixed' ? money(p.value) : `${esc(p.value)}%`} · ${p.scope === 'all' ? 'Todos los servicios' : p.scope === 'category' ? `Categoría: ${esc(p.categoryValue)}` : 'Servicios específicos'} · usos: ${esc(p.usageCount)}${p.usageLimit ? `/${esc(p.usageLimit)}` : ''} · ${p.active ? 'Activa' : 'Pausada'}</div></div>
        <button class="toggle ${p.active ? 'active' : ''}" data-toggle-promo="${esc(p.id)}" data-active="${p.active ? '1' : '0'}"><span></span></button>
      </div>
      <div class="row-actions">
        <button class="mini-action" data-edit-promo="${esc(p.id)}">Editar</button>
        <button class="mini-action" data-delete-promo="${esc(p.id)}">Eliminar</button>
      </div>
    </div>`).join('') : `<div class="empty">No hay promociones todavía.</div>`}
  </div>`;
}

function adminAcademia(data) {
  const courses = data?.courses || [];
  const registrations = data?.courseRegistrations || [];
  const editing = state.admin.editingCourseId ? courses.find(c => c.id === state.admin.editingCourseId) : null;
  const draftImages = state.admin.courseImageDraft || [];
  return `<div class="card-list">
    <form class="card" data-course-form="${editing ? esc(editing.id) : ''}">
      <div class="eyebrow">${editing ? 'EDITAR CURSO' : 'NUEVO CURSO'}</div>
      <div class="form-field"><label>Título</label><input name="title" value="${esc(editing?.title || '')}" placeholder="Certificación en Poligel"></div>
      <div class="form-field"><label>Descripción</label><textarea name="description" rows="3" placeholder="Aprende técnicas profesionales...">${esc(editing?.description || '')}</textarea></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Precio</label><input type="number" min="0" name="price" value="${esc(editing?.price ?? 0)}"></div>
        <div class="form-field"><label>Duración</label><input name="duration" value="${esc(editing?.duration || '')}" placeholder="2 días (16 horas)"></div>
      </div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Nivel</label><input name="level" value="${esc(editing?.level || '')}" placeholder="Principiante, avanzado..."></div>
        <div class="form-field"><label>Cupo</label><input type="number" min="0" name="capacity" value="${esc(editing?.capacity ?? 0)}"></div>
      </div>
      <div class="form-field"><label>Próxima fecha (opcional)</label><input type="date" name="startDate" value="${esc(editing?.startDate || '')}"></div>
      <div class="form-field">
        <label>Fotos del curso (puedes subir varias)</label>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" data-course-image-input>
        ${state.admin.courseImageUploading ? `<div class="empty">Subiendo imágenes…</div>` : ''}
        ${draftImages.length ? `<div class="admin-thumb-row">${draftImages.map((url, i) => `<div class="admin-thumb-wrap"><img src="${esc(url)}" alt="" class="admin-thumb"><button type="button" class="thumb-remove" data-remove-course-image="${i}" aria-label="Quitar foto">✕</button></div>`).join('')}</div>` : `<div class="service-meta" style="margin-top:6px">Sin fotos todavía.</div>`}
      </div>
      <label class="pill-button" style="margin-bottom:12px"><input type="checkbox" name="active" ${(!editing || editing.active) ? 'checked' : ''}> Activo (visible en el sitio)</label>
      <div class="row-actions">
        <button class="btn btn-primary" type="submit">${editing ? 'GUARDAR CAMBIOS' : 'CREAR CURSO'}</button>
        ${editing ? `<button type="button" class="pill-button" data-cancel-course-edit>CANCELAR</button>` : ''}
      </div>
    </form>
    ${courses.length ? courses.map(c => `<div class="admin-service-row">
      <div class="admin-service-main">
        <div><div class="service-name">${esc(c.title)}</div><div class="service-meta">${money(c.price)} · ${esc(c.duration)} · Cupo ${esc(c.capacity)} · ${c.active ? 'Activo' : 'Pausado'}</div></div>
        <button class="toggle ${c.active ? 'active' : ''}" data-toggle-course="${esc(c.id)}" data-active="${c.active ? '1' : '0'}"><span></span></button>
      </div>
      ${c.imageUrls && c.imageUrls.length ? `<div class="admin-thumb-row">${c.imageUrls.map(url => `<img src="${esc(url)}" alt="" class="admin-thumb">`).join('')}</div>` : ''}
      <div class="row-actions">
        <button class="mini-action" data-edit-course="${esc(c.id)}">Editar</button>
        <button class="mini-action" data-delete-course="${esc(c.id)}">Eliminar</button>
      </div>
    </div>`).join('') : `<div class="empty">Aún no hay cursos.</div>`}
    <div class="card crm-intro">
      <div class="title">Inscripciones</div>
      <div class="subtitle">Nuevas alumnas registradas desde el sitio público.</div>
    </div>
    ${registrations.length ? registrations.map(r => `<div class="client-row client-card">
      <div class="client-card-head">
        <div><div class="service-name">${esc(r.name)}</div><div class="service-meta">${esc(r.courseTitle)} · WhatsApp: ${esc(r.whatsapp)}${r.email ? ` · ${esc(r.email)}` : ''}</div></div>
        <span class="status-chip ${esc(r.status)}">${esc(r.status === 'new' ? 'NUEVA' : r.status === 'confirmed' ? 'CONFIRMADA' : 'CANCELADA')}</span>
      </div>
      ${r.notes ? `<div class="service-meta">${esc(r.notes)}</div>` : ''}
      <div class="row-actions">
        <a class="mini-action" target="_blank" rel="noopener" href="${esc(whatsappTo(r.whatsapp, `Hola ${r.name} ✨ te escribimos de Black Rococo Academy sobre tu inscripción a "${r.courseTitle}".`))}">WhatsApp</a>
        ${r.status !== 'confirmed' ? `<button class="mini-action" data-confirm-registration="${esc(r.id)}">Confirmar</button>` : ''}
        ${r.status !== 'cancelled' ? `<button class="mini-action" data-cancel-registration="${esc(r.id)}">Cancelar</button>` : ''}
      </div>
    </div>`).join('') : `<div class="empty">Sin inscripciones todavía.</div>`}
  </div>`;
}

function adminClients(data) {
  const clients = data?.clients || [];
  const selected = state.admin.selectedClientId ? clientById(state.admin.selectedClientId) : null;
  if (selected) return adminClientProfile(selected);
  return `<div class="card-list clients-crm-list">
    <div class="card crm-intro">
      <div class="title">CRM de clientas</div>
      <div class="subtitle">Historial, próxima cita, servicios anteriores y preferencias para dar atención personalizada.</div>
    </div>
    ${clients.length ? clients.map(c => `<div class="client-row client-card">
      <div class="client-card-head">
        <div><div class="service-name">${esc(c.name)}</div><div class="service-meta">WhatsApp: ${esc(c.whatsapp)} · Visitas: ${esc(c.visits)} · Última: ${esc(c.lastVisit || 'Sin cita')}</div></div>
        <button class="mini-action" data-client-profile="${esc(c.id)}">Ver perfil</button>
      </div>
      <div class="client-kpis">
        <span>Próxima: ${c.nextAppointment ? `${esc(c.nextAppointment.date)} ${esc(c.nextAppointment.time)}` : 'Sin próxima cita'}</span>
        <span>Favorito: ${esc(c.favoriteService || 'Sin historial')}</span>
        <span>Gastado completado: ${money(c.totalSpent || 0)}</span>
      </div>
      <div class="service-meta">${esc(profileSummary(c))}</div>
    </div>`).join('') : `<div class="empty">Aún no hay clientas.</div>`}
  </div>`;
}

function appointmentMiniCard(a) {
  return `<div class="history-row">
    <div><div class="service-name">${esc(a.serviceName)}</div><div class="service-meta">${esc(formatDate(a.date))} · ${esc(a.time)} · ${money(a.servicePrice)}</div></div>
    <span class="status-chip ${esc(a.status)}">${esc(a.statusLabel)}</span>
  </div>`;
}

function adminClientProfile(c) {
  const history = c.appointmentHistory || [];
  const pastServices = c.pastServices || [];
  return `<div class="client-profile-screen">
    <div class="section-head compact-head profile-head">
      <div><div class="title">${esc(c.name)}</div><div class="subtitle">Perfil completo de clienta · ${esc(c.whatsapp)}</div></div>
      <button class="pill-button" data-client-back>VOLVER</button>
    </div>
    <div class="client-profile-grid">
      <div class="card profile-summary-card">
        <div class="eyebrow">RESUMEN</div>
        <div class="profile-stats">
          <div><b>${esc(c.visits || 0)}</b><span>Visitas</span></div>
          <div><b>${esc(c.completedVisits || 0)}</b><span>Completadas</span></div>
          <div><b>${money(c.totalSpent || 0)}</b><span>Ingresos completados</span></div>
        </div>
        <div class="info-grid profile-info-grid">
          <div class="info-line"><strong>Última cita</strong><span>${esc(c.lastAppointment ? `${c.lastAppointment.date} ${c.lastAppointment.time}` : c.lastVisit || 'Sin historial')}</span></div>
          <div class="info-line"><strong>Próxima cita</strong><span>${esc(c.nextAppointment ? `${c.nextAppointment.date} ${c.nextAppointment.time} · ${c.nextAppointment.serviceName}` : 'Sin próxima cita')}</span></div>
          <div class="info-line"><strong>Servicio favorito</strong><span>${esc(c.favoriteService || 'Sin historial')}</span></div>
          <div class="info-line"><strong>Preferencias</strong><span>${esc(profileSummary(c))}</span></div>
        </div>
        <div class="row-actions">
          <a class="mini-action" target="_blank" rel="noopener" href="${esc(whatsappTo(c.whatsapp, `Hola ${c.name || ''} ✨ te escribimos de Black Rococo sobre tu cita.`))}">WhatsApp clienta</a>
          ${c.nextAppointment ? `<a class="mini-action" target="_blank" rel="noopener" href="${esc(c.nextAppointment.clientReminderUrl)}">Recordar próxima cita</a>` : ''}
        </div>
      </div>
      <form class="card profile-form" data-client-profile-form="${esc(c.id)}">
        <div class="eyebrow">DATOS Y PREFERENCIAS</div>
        <div class="form-grid two-col">
          <div class="form-field"><label>Nombre</label><input name="name" value="${esc(c.name)}"></div>
          <div class="form-field"><label>WhatsApp</label><input name="whatsapp" inputmode="tel" value="${esc(c.whatsapp)}"></div>
          <div class="form-field"><label>Email</label><input name="email" value="${esc(c.email || '')}" placeholder="opcional"></div>
          <div class="form-field"><label>Instagram</label><input name="instagram" value="${esc(c.instagram || '')}" placeholder="@usuario"></div>
          <div class="form-field"><label>Cumpleaños</label><input type="date" name="birthday" value="${esc(c.birthday || '')}"></div>
          <div class="form-field"><label>Horario preferido</label><input name="timePreference" value="${esc(c.timePreference || '')}" placeholder="Mañana, tarde, sábado..."></div>
          <div class="form-field"><label>Estilo preferido</label><input name="styleChoice" value="${esc(c.styleChoice || '')}" placeholder="Natural, french, editorial..."></div>
          <div class="form-field"><label>Color favorito</label><input name="colorChoice" value="${esc(c.colorChoice || '')}" placeholder="Nude, rojo, negro..."></div>
          <div class="form-field"><label>Bebida favorita</label><input name="drinkChoice" value="${esc(c.drinkChoice || '')}" placeholder="Café, té, agua..."></div>
          <div class="form-field"><label>Alergias/cuidados</label><input name="allergies" value="${esc(c.allergies || '')}" placeholder="Piel sensible, alergias..."></div>
        </div>
        <div class="form-field"><label>Notas internas</label><textarea name="notes" rows="4" placeholder="Preferencias, trato, ideas de diseño, observaciones...">${esc(c.notes || '')}</textarea></div>
        <button class="btn btn-primary">GUARDAR PERFIL</button>
      </form>
      <div class="card service-history-card">
        <div class="eyebrow">SERVICIOS ANTERIORES</div>
        ${pastServices.length ? pastServices.map(s => `<div class="history-row"><div><div class="service-name">${esc(s.serviceName)}</div><div class="service-meta">${esc(s.count)} vez/veces · Última: ${esc(s.lastDate)}</div></div></div>`).join('') : `<div class="empty">Sin servicios anteriores.</div>`}
      </div>
      <div class="card appointment-history-card">
        <div class="eyebrow">HISTORIAL DE CITAS</div>
        ${history.length ? history.map(appointmentMiniCard).join('') : `<div class="empty">Sin historial de citas.</div>`}
      </div>
    </div>
  </div>`;
}
function adminGallery(data) {
  const media = data?.media || [];
  const editing = state.admin.editingMediaId ? media.find(m => m.id === state.admin.editingMediaId) : null;
  const draft = state.admin.mediaDraft;
  const categories = [...new Set(media.map(m => m.category).filter(Boolean))];
  return `<div class="card-list">
    <form class="card" data-media-form="${editing ? esc(editing.id) : ''}">
      <div class="eyebrow">${editing ? 'EDITAR ELEMENTO' : 'NUEVA FOTO O VIDEO'}</div>
      <div class="form-field">
        <label>Archivo (foto, GIF o video corto)</label>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" data-media-file-input>
        ${state.admin.mediaUploading ? `<div class="empty">Subiendo archivo…</div>` : ''}
        ${draft?.url ? `<div class="admin-thumb-row">
          ${draft.kind === 'video'
            ? `<video src="${esc(draft.url)}" class="admin-thumb" muted loop playsinline></video>`
            : `<img src="${esc(draft.url)}" alt="" class="admin-thumb">`}
          <button type="button" class="thumb-remove" data-clear-media-draft aria-label="Quitar archivo">✕</button>
        </div>` : `<div class="service-meta" style="margin-top:6px">Sin archivo seleccionado.</div>`}
      </div>
      <div class="form-field"><label>Título / caption</label><input name="title" value="${esc(editing?.title || '')}" placeholder="Set editorial en poligel"></div>
      <div class="form-field"><label>Descripción breve</label><textarea name="description" rows="2" placeholder="Manicure ruso con nail art en tono nude...">${esc(editing?.description || '')}</textarea></div>
      <div class="form-grid two-col">
        <div class="form-field"><label>Categoría</label><input name="category" list="media-categories" value="${esc(editing?.category || '')}" placeholder="Manicure Ruso, Poligel, Pedicure..."></div>
        <datalist id="media-categories">${categories.map(cat => `<option value="${esc(cat)}">`).join('')}</datalist>
        <div class="form-field"><label>Orden (menor = primero)</label><input type="number" name="order" value="${esc(editing?.order ?? 0)}"></div>
      </div>
      <div class="pill-row" style="margin-bottom:12px">
        <label class="pill-button"><input type="checkbox" name="showInCarousel" ${editing?.showInCarousel ? 'checked' : ''}> Mostrar en carrusel de inicio</label>
        <label class="pill-button"><input type="checkbox" name="showInGallery" ${(!editing || editing.showInGallery) ? 'checked' : ''}> Mostrar en galería</label>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary" type="submit">${editing ? 'GUARDAR CAMBIOS' : 'AGREGAR A LA GALERÍA'}</button>
        ${editing ? `<button type="button" class="pill-button" data-cancel-media-edit>CANCELAR</button>` : ''}
      </div>
    </form>
    ${media.length ? media.map(m => `<div class="admin-service-row">
      <div class="admin-service-main">
        <div class="admin-thumb-row">
          ${m.kind === 'video' ? `<video src="${esc(m.url)}" class="admin-thumb" muted loop playsinline></video>` : `<img src="${esc(m.url)}" alt="" class="admin-thumb">`}
          <div><div class="service-name">${esc(m.title || 'Sin título')}</div><div class="service-meta">${esc(m.category || 'Sin categoría')} · orden ${esc(m.order)} · ${m.kind === 'video' ? 'Video' : 'Foto'}</div></div>
        </div>
      </div>
      <div class="pill-row">
        <button class="pill-button ${m.showInCarousel ? 'active' : ''}" data-toggle-media-carousel="${esc(m.id)}" data-active="${m.showInCarousel ? '1' : '0'}">Carrusel ${m.showInCarousel ? '✓' : ''}</button>
        <button class="pill-button ${m.showInGallery ? 'active' : ''}" data-toggle-media-gallery="${esc(m.id)}" data-active="${m.showInGallery ? '1' : '0'}">Galería ${m.showInGallery ? '✓' : ''}</button>
      </div>
      <div class="row-actions">
        <button class="mini-action" data-edit-media="${esc(m.id)}">Editar</button>
        <button class="mini-action" data-delete-media="${esc(m.id)}">Eliminar</button>
      </div>
    </div>`).join('') : `<div class="empty">Aún no hay fotos ni videos en la galería.</div>`}
  </div>`;
}

function adminPublish(data) {
  const posts = data?.posts || [];
  return `<div class="card-list">
    <form class="card" data-post-form>
      <div class="form-field"><label>Subir imagen desde celular o computadora</label><input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
      <div class="form-field"><label>Caption</label><textarea name="caption" rows="4" placeholder="Nuevo set disponible ✨"></textarea></div>
      <div class="pill-row" style="margin-bottom:12px">
        <label class="pill-button"><input type="checkbox" name="target" value="instagram" checked> IG</label>
        <label class="pill-button"><input type="checkbox" name="target" value="tiktok"> TikTok</label>
        <label class="pill-button"><input type="checkbox" name="target" value="galeria" checked> Galería</label>
      </div>
      <button class="btn btn-primary">SUBIR Y GUARDAR</button>
      <div class="subtitle" style="margin-top:10px">La imagen se guarda en /uploads y aparece en la galería del sitio. Para publicar automáticamente en redes se conecta Meta/Instagram API o Make/Zapier.</div>
    </form>
    ${posts.length ? posts.map(p => `<div class="post-row">${p.imageUrl ? `<img class="post-thumb" alt="Foto publicación" src="${esc(p.imageUrl)}">` : ''}<div><div class="service-name">${esc(p.caption)}</div><div class="service-meta">${esc(p.targets.join(', '))} · ${new Date(p.publishedAt).toLocaleString('es-MX')}</div></div></div>`).join('') : `<div class="empty">No hay publicaciones guardadas.</div>`}
  </div>`;
}

function adminIntegrations() {
  const gcal = state.admin.googleCalendar;
  const params = new URLSearchParams(location.search);
  const gcalParam = params.get('gcal');
  const banner = gcalParam === 'connected'
    ? `<div class="card" style="border-color:#2e7d32;margin-bottom:16px">✅ Google Calendar conectado correctamente.</div>`
    : gcalParam === 'denied'
      ? `<div class="error-box">La conexión fue cancelada o el enlace expiró. Intenta de nuevo.</div>`
      : gcalParam === 'error'
        ? `<div class="error-box">Ocurrió un error al conectar. Intenta de nuevo o revisa la configuración.</div>`
        : '';

  if (!gcal) {
    return `<div class="card-list">${banner}<div class="card"><div class="eyebrow">GOOGLE CALENDAR</div><div class="subtitle">Cargando estado...</div></div></div>`;
  }

  return `<div class="card-list">
    ${banner}
    <div class="card">
      <div class="eyebrow">GOOGLE CALENDAR</div>
      <div class="title" style="font-size:20px;margin:8px 0">${gcal.connected ? 'Conectado ✓' : 'No conectado'}</div>
      ${gcal.connected
        ? `<div class="subtitle">Cuenta: ${esc(gcal.email)}</div><div class="subtitle" style="margin-bottom:14px">Cada nueva reserva bloquea tu calendario automáticamente. Cancelar una cita libera el espacio.</div><button class="pill-button" data-gcal-disconnect>DESCONECTAR</button>`
        : gcal.configured
          ? `<div class="subtitle" style="margin-bottom:14px">Conecta tu cuenta de Google para bloquear tu calendario automáticamente en cada reserva.</div><a class="btn btn-primary" href="/api/admin/google-calendar/connect">CONECTAR GOOGLE CALENDAR</a>`
          : `<div class="subtitle">Falta configurar GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en el servidor. Ver docs/GOOGLE_CALENDAR_SETUP.md.</div>`
      }
    </div>
  </div>`;
}

async function loadGoogleCalendarStatus() {
  try {
    state.admin.googleCalendar = await api('/api/admin/google-calendar/status');
  } catch (err) {
    state.admin.googleCalendar = { configured: false, connected: false, email: '' };
  }
  render();
}

async function disconnectGoogleCalendar() {
  if (!confirm('¿Desconectar Google Calendar? Las citas ya no se bloquearán automáticamente.')) return;
  await api('/api/admin/google-calendar/disconnect', { method: 'POST' });
  await loadGoogleCalendarStatus();
}

function render() {
  if (!state.config) return;
  const body = state.mode === 'admin'
    ? adminScreen()
    : state.tab === 'servicios'
      ? servicesScreen()
      : state.tab === 'reservar'
        ? bookingScreen()
        : state.tab === 'galeria'
          ? galleryScreen()
          : state.tab === 'academia'
            ? academiaScreen()
            : homeScreen();
  app.innerHTML = `${state.mode !== 'admin' ? topSwitch() : ''}${body}${state.mode !== 'admin' && state.serviceModalId ? serviceDetailModal() : ''}${state.mode !== 'admin' && state.lightbox ? lightboxOverlay() : ''}`;
  afterRender();
}

let carouselRafId = null;
function manageAutoCarousel() {
  if (carouselRafId) {
    cancelAnimationFrame(carouselRafId);
    carouselRafId = null;
  }
  const el = document.querySelector('[data-auto-carousel]');
  if (!el) return;
  let paused = false;
  let lastTs = null;
  const speed = 34; // px per second
  const pause = () => { paused = true; };
  const resume = () => { paused = false; };
  el.addEventListener('mouseenter', pause);
  el.addEventListener('mouseleave', resume);
  el.addEventListener('touchstart', pause, { passive: true });
  el.addEventListener('touchend', () => setTimeout(resume, 2000), { passive: true });
  function step(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (!paused && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += speed * dt;
      const half = el.scrollWidth / 2;
      if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
    }
    carouselRafId = requestAnimationFrame(step);
  }
  carouselRafId = requestAnimationFrame(step);
}

function manageLightboxSwipe() {
  const el = document.querySelector('[data-lightbox-container]');
  if (!el) return;
  let startX = null;
  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (startX == null) return;
    const endX = e.changedTouches[0].clientX;
    const delta = endX - startX;
    startX = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) lightboxNext(); else lightboxPrev();
  }, { passive: true });
}

function afterRender() {
  manageAutoCarousel();
  manageLightboxSwipe();
}

app.addEventListener('click', async event => {
  if (event.target.matches('[data-close-service-modal]')) {
    state.serviceModalId = null;
    return render();
  }
  if (event.target.matches('[data-close-lightbox]')) {
    return closeLightbox();
  }
  const target = event.target.closest('button, a, label, [data-view-service], [data-open-lightbox]');
  if (!target) return;

  if (target.dataset.viewService) {
    state.serviceModalId = target.dataset.viewService;
    return render();
  }
  if (target.hasAttribute('data-book-from-modal')) {
    const id = target.getAttribute('data-book-from-modal');
    state.serviceModalId = null;
    return startBooking(id);
  }
  if (target.dataset.openLightbox !== undefined) {
    const list = target.dataset.lightboxList === 'homeCarousel' ? state.homeCarouselCache : state.galleryFilteredCache;
    return openLightbox(list || [], Number(target.dataset.openLightbox));
  }
  if (target.hasAttribute('data-lightbox-next')) return lightboxNext();
  if (target.hasAttribute('data-lightbox-prev')) return lightboxPrev();
  if (target.dataset.galleryFilter !== undefined) {
    state.galleryFilter = target.dataset.galleryFilter;
    state.galleryVisibleCount = 9;
    return render();
  }
  if (target.hasAttribute('data-load-more-gallery')) {
    state.galleryVisibleCount = (state.galleryVisibleCount || 9) + 9;
    return render();
  }

  if (target.dataset.action === 'client') return goClient('inicio');
  if (target.dataset.action === 'admin') return goAdmin();
  if (target.dataset.tab) return goClient(target.dataset.tab);
  if (target.dataset.book) return startBooking(target.dataset.book);
  if (target.dataset.selectService) {
    state.booking.serviceId = target.dataset.selectService;
    state.booking.step = 2;
    state.booking.time = null;
    await loadAvailability();
    return render();
  }
  if (target.dataset.step) {
    state.booking.step = Number(target.dataset.step);
    state.booking.error = '';
    if (state.booking.step === 2) await loadAvailability();
    return render();
  }
  if (target.dataset.date) {
    state.booking.date = target.dataset.date;
    state.booking.time = null;
    await loadAvailability();
    return render();
  }
  if (target.dataset.time) {
    state.booking.time = target.dataset.time;
    return render();
  }
  if (target.hasAttribute('data-confirm-booking')) return createBooking();
  if (target.hasAttribute('data-reset-booking')) {
    state.booking = { step: 1, serviceId: null, date: todayLocal(), time: null, name: '', whatsapp: '', styleChoice: '', colorChoice: '', drinkChoice: '', timePreference: '', allergies: '', notes: '', promoCode: '', loadingSlots: false, slots: [], error: '', success: null };
    return render();
  }
  if (target.hasAttribute('data-admin-login')) return adminLogin();
  if (target.hasAttribute('data-logout')) return adminLogout();
  if (target.hasAttribute('data-gcal-disconnect')) return disconnectGoogleCalendar();
  if (target.dataset.markNotification) return markNotificationRead(target.dataset.markNotification);
  if (target.hasAttribute('data-mark-all-notifications')) return markAllNotificationsRead();
  if (target.dataset.adminTab) {
    state.admin.tab = target.dataset.adminTab;
    if (state.admin.tab !== 'clientas') state.admin.selectedClientId = null;
    if (state.admin.tab === 'integraciones') loadGoogleCalendarStatus();
    return render();
  }
  if (target.dataset.clientProfile) {
    state.admin.tab = 'clientas';
    state.admin.selectedClientId = target.dataset.clientProfile;
    return render();
  }
  if (target.hasAttribute('data-client-back')) {
    state.admin.selectedClientId = null;
    return render();
  }
  if (target.dataset.cycleStatus) return cycleStatus(target.dataset.cycleStatus, target.dataset.currentStatus);
  if (target.dataset.priceStep) {
    const id = target.dataset.priceStep;
    const service = state.admin.data.services.find(s => s.id === id);
    return updateService(id, { price: Number(service.price) + Number(target.dataset.delta) });
  }
  if (target.dataset.toggleService) {
    return updateService(target.dataset.toggleService, { active: target.dataset.active !== '1' });
  }
  if (target.dataset.selectCourse) return selectCourse(target.dataset.selectCourse);
  if (target.hasAttribute('data-cancel-course-select')) {
    state.academia.selectedCourseId = null;
    return render();
  }
  if (target.dataset.carouselPrev) {
    const id = target.dataset.carouselPrev;
    const course = courseById(id);
    const total = course?.imageUrls?.length || 1;
    state.academia.imageIndex[id] = ((state.academia.imageIndex[id] || 0) - 1 + total) % total;
    return render();
  }
  if (target.dataset.carouselNext) {
    const id = target.dataset.carouselNext;
    const course = courseById(id);
    const total = course?.imageUrls?.length || 1;
    state.academia.imageIndex[id] = ((state.academia.imageIndex[id] || 0) + 1) % total;
    return render();
  }
  if (target.hasAttribute('data-confirm-course-registration')) return submitCourseRegistration();
  if (target.hasAttribute('data-reset-academia')) {
    state.academia = { selectedCourseId: null, name: '', whatsapp: '', email: '', notes: '', imageIndex: state.academia.imageIndex, error: '', success: null };
    return render();
  }
  if (target.dataset.editPromo) {
    state.admin.editingPromoId = target.dataset.editPromo;
    return render();
  }
  if (target.hasAttribute('data-cancel-promo-edit')) {
    state.admin.editingPromoId = null;
    return render();
  }
  if (target.dataset.togglePromo) return togglePromotion(target.dataset.togglePromo, target.dataset.active);
  if (target.dataset.deletePromo) return deletePromotion(target.dataset.deletePromo);
  if (target.dataset.editCourse) {
    state.admin.editingCourseId = target.dataset.editCourse;
    const course = courseById(target.dataset.editCourse) || (state.admin.data?.courses || []).find(c => c.id === target.dataset.editCourse);
    state.admin.courseImageDraft = course?.imageUrls ? [...course.imageUrls] : [];
    return render();
  }
  if (target.hasAttribute('data-cancel-course-edit')) {
    state.admin.editingCourseId = null;
    state.admin.courseImageDraft = [];
    return render();
  }
  if (target.dataset.removeCourseImage !== undefined) {
    removeCourseDraftImage(target.dataset.removeCourseImage);
    return;
  }
  if (target.dataset.toggleCourse) return toggleCourse(target.dataset.toggleCourse, target.dataset.active);
  if (target.dataset.deleteCourse) return deleteCourse(target.dataset.deleteCourse);
  if (target.dataset.confirmRegistration) return updateCourseRegistrationStatus(target.dataset.confirmRegistration, 'confirmed');
  if (target.dataset.cancelRegistration) return updateCourseRegistrationStatus(target.dataset.cancelRegistration, 'cancelled');
  if (target.dataset.editService) {
    state.admin.editingServiceId = target.dataset.editService;
    return render();
  }
  if (target.hasAttribute('data-cancel-service-edit')) {
    state.admin.editingServiceId = null;
    return render();
  }
  if (target.dataset.deleteService) return deleteServiceEntry(target.dataset.deleteService);
  if (target.dataset.toggleFeaturedService) return toggleFeaturedService(target.dataset.toggleFeaturedService, target.dataset.featured);
  if (target.dataset.editMedia) {
    state.admin.editingMediaId = target.dataset.editMedia;
    const item = (state.admin.data?.media || []).find(m => m.id === target.dataset.editMedia);
    state.admin.mediaDraft = item ? { url: item.url, kind: item.kind, posterUrl: item.posterUrl } : null;
    return render();
  }
  if (target.hasAttribute('data-cancel-media-edit')) {
    state.admin.editingMediaId = null;
    state.admin.mediaDraft = null;
    return render();
  }
  if (target.hasAttribute('data-clear-media-draft')) return clearMediaDraft();
  if (target.dataset.toggleMediaCarousel) return toggleMediaFlag(target.dataset.toggleMediaCarousel, 'showInCarousel', target.dataset.active !== '1');
  if (target.dataset.toggleMediaGallery) return toggleMediaFlag(target.dataset.toggleMediaGallery, 'showInGallery', target.dataset.active !== '1');
  if (target.dataset.deleteMedia) return deleteMediaEntry(target.dataset.deleteMedia);
});

app.addEventListener('input', event => {
  const el = event.target;
  if (el.dataset.field) state.booking[el.dataset.field] = el.value;
  if (el.dataset.adminField) state.admin[el.dataset.adminField] = el.value;
  if (el.dataset.academiaField) state.academia[el.dataset.academiaField] = el.value;
});


app.addEventListener('change', async event => {
  const el = event.target;
  if (el.matches('[data-booking-date-input]')) {
    state.booking.date = el.value;
    state.booking.time = null;
    await loadAvailability();
    return render();
  }
  if (el.matches('[data-course-image-input]')) {
    return handleCourseImageFilesSelected(el);
  }
  if (el.matches('[data-media-file-input]')) {
    return handleMediaFileSelected(el);
  }
});

app.addEventListener('submit', event => {
  const postForm = event.target.closest('[data-post-form]');
  if (postForm) {
    event.preventDefault();
    createPost(postForm);
    return;
  }
  const clientForm = event.target.closest('[data-client-profile-form]');
  if (clientForm) {
    event.preventDefault();
    updateClientProfile(clientForm);
    return;
  }
  const promoForm = event.target.closest('[data-promo-form]');
  if (promoForm) {
    event.preventDefault();
    createOrUpdatePromotion(promoForm);
    return;
  }
  const courseForm = event.target.closest('[data-course-form]');
  if (courseForm) {
    event.preventDefault();
    createOrUpdateCourse(courseForm);
    return;
  }
  const serviceForm = event.target.closest('[data-service-form]');
  if (serviceForm) {
    event.preventDefault();
    createOrUpdateService(serviceForm);
    return;
  }
  const mediaForm = event.target.closest('[data-media-form]');
  if (mediaForm) {
    event.preventDefault();
    createOrUpdateMedia(mediaForm);
  }
});

window.addEventListener('hashchange', () => {
  setHashMode();
  if (state.mode === 'admin') checkAdmin().then(render);
  else render();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (state.lightbox) return closeLightbox();
    if (state.serviceModalId) {
      state.serviceModalId = null;
      return render();
    }
  }
  if (state.lightbox) {
    if (event.key === 'ArrowRight') return lightboxNext();
    if (event.key === 'ArrowLeft') return lightboxPrev();
  }
});

loadInitial().catch(err => {
  app.innerHTML = `<div class="loading-card">Error: ${esc(err.message)}</div>`;
});
