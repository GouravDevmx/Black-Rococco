const supabase = require('./supabaseClient');

// Single-salon mode: this looks up the one salon row (by slug) ONCE at
// server boot (see server.js's startServer()), not per-request. Kept as
// its own small module in case multi-salon support is ever revisited.
async function getSalonBySlug(slug) {
  if (!slug) slug = 'nails';   // ⭐ FIX

  if (!supabase) return null;

  const { data, error } = await supabase
    .from('salons')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  if (error) throw new Error(`Error resolving salon "${slug}": ${error.message}`);

  return data || null;
}

module.exports = { getSalonBySlug };
