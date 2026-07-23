const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/config
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company_config')
      .select('*')
      .single();

    if (error) throw error;

    // Mask sensitive keys for frontend
    if (data) {
      if (data.hostaway_api_key) {
        data.hostaway_api_key_masked = '****' + data.hostaway_api_key.slice(-4);
      }
      if (data.whatsapp_api_key) {
        data.whatsapp_api_key_masked = '****' + data.whatsapp_api_key.slice(-4);
      }
    }

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/config
router.put('/', async (req, res) => {
  try {
    const updates = { ...req.body };

    // Don't overwrite keys if masked value sent
    if (updates.hostaway_api_key_masked) delete updates.hostaway_api_key_masked;
    if (updates.whatsapp_api_key_masked) delete updates.whatsapp_api_key_masked;
    if (updates.hostaway_api_key === '') delete updates.hostaway_api_key;
    if (updates.whatsapp_api_key === '') delete updates.whatsapp_api_key;

    // Get existing config ID
    const { data: existing } = await supabase
      .from('company_config')
      .select('id')
      .single();

    let data, error;
    if (existing) {
      ({ data, error } = await supabase
        .from('company_config')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabase
        .from('company_config')
        .insert(updates)
        .select()
        .single());
    }

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/config/dashboard-stats
router.get('/dashboard-stats', async (req, res) => {
  try {
    const { count: propertiesCount } = await supabase
      .from('properties').select('*', { count: 'exact', head: true }).eq('is_active', true);

    const { count: clientsCount } = await supabase
      .from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true);

    const { count: quotesCount } = await supabase
      .from('quotes').select('*', { count: 'exact', head: true });

    const { count: pendingQuotes } = await supabase
      .from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'sent');

    const { count: activeReminders } = await supabase
      .from('reminders').select('*', { count: 'exact', head: true }).eq('is_completed', false);

    // Recent quotes with totals
    const { data: recentQuotes } = await supabase
      .from('quotes')
      .select('total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    const totalRevenue = (recentQuotes || [])
      .filter(q => q.status === 'accepted')
      .reduce((sum, q) => sum + parseFloat(q.total || 0), 0);

    res.json({
      data: {
        properties: propertiesCount || 0,
        clients: clientsCount || 0,
        quotes: quotesCount || 0,
        pending_quotes: pendingQuotes || 0,
        active_reminders: activeReminders || 0,
        accepted_revenue: totalRevenue,
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
