const supabase = require('./supabaseClient');

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || '').toLowerCase(); // e.g. "yoursite.com"
const CACHE_TTL_MS = 60 * 1000;
const cacheBySlug = new Map(); // slug -> { salon, expiresAt }

function extractSlugFromHost(host) {
  if (!host) return '';
  const hostname = host.split(':')[0].toLowerCase();

  // Local dev convenience: http://nails.localhost:3000, http://makeup.localhost:3000
  if (hostname.endsWith('.localhost')) {
    return hostname.slice(0, -'.localhost'.length);
  }

  if (ROOT_DOMAIN && hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return hostname.slice(0, -(`.${ROOT_DOMAIN}`.length));
  }

  // hostname === ROOT_DOMAIN itself (no subdomain) -> no tenant from host
  return '';
}

function resolveSlugFromRequest(req, url) {
  // Priority: explicit override (local testing / Postman) > subdomain.
  const headerSlug = req.headers['x-salon-slug'];
  if (headerSlug) return String(headerSlug).toLowerCase().trim();

  const querySlug = url.searchParams.get('salon');
  if (querySlug) return String(querySlug).toLowerCase().trim();

  return extractSlugFromHost(req.headers.host || '');
}

async function getSalonBySlug(slug) {
  if (!slug) return null;
  if (!supabase) return null; // local JSON-file mode: no multi-tenant DB configured
  const cached = cacheBySlug.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.salon;

  const { data, error } = await supabase
    .from('salons')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  if (error) throw new Error(`Error resolving salon "${slug}": ${error.message}`);
  cacheBySlug.set(slug, { salon: data || null, expiresAt: Date.now() + CACHE_TTL_MS });
  return data || null;
}

function invalidateSalonCache(slug) {
  if (slug) cacheBySlug.delete(slug);
}

async function resolveSalonFromRequest(req, url) {
  const slug = resolveSlugFromRequest(req, url);
  if (!slug) return { slug: '', salon: null };
  const salon = await getSalonBySlug(slug);
  return { slug, salon };
}

module.exports = { resolveSalonFromRequest, getSalonBySlug, invalidateSalonCache };
