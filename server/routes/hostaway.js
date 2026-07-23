const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const HostawayService = require('../services/hostaway');

// POST /api/hostaway/sync - Sync all listings from Hostaway
router.post('/sync', async (req, res) => {
  try {
    const { data: config } = await supabase
      .from('company_config')
      .select('hostaway_api_key, hostaway_account_id')
      .single();

    if (!config?.hostaway_api_key || !config?.hostaway_account_id) {
      return res.status(400).json({ error: 'Hostaway API credentials not configured. Go to Settings to add them.' });
    }

    const hostaway = new HostawayService(config.hostaway_api_key, config.hostaway_account_id);
    const listings = await hostaway.getListings();

    let synced = 0;
    let errors = 0;

    for (const listing of listings) {
      try {
        const transformed = hostaway.transformListing(listing);

        const { error } = await supabase
          .from('properties')
          .upsert(transformed, { onConflict: 'hostaway_id' });

        if (error) {
          console.error(`Error syncing listing ${listing.id}:`, error);
          errors++;
        } else {
          synced++;
        }
      } catch (e) {
        console.error(`Error processing listing ${listing.id}:`, e.message);
        errors++;
      }
    }

    // Log the sync activity
    await supabase.from('activity_log').insert({
      entity_type: 'system',
      entity_id: '00000000-0000-0000-0000-000000000000',
      action: 'hostaway_sync',
      details: { total: listings.length, synced, errors },
    });

    res.json({
      success: true,
      total: listings.length,
      synced,
      errors,
      message: `Synced ${synced} properties from Hostaway`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/hostaway/pricing/:listingId - Get pricing from Hostaway
router.get('/pricing/:hostawayId', async (req, res) => {
  try {
    const { data: config } = await supabase
      .from('company_config')
      .select('hostaway_api_key, hostaway_account_id')
      .single();

    if (!config?.hostaway_api_key) {
      return res.status(400).json({ error: 'Hostaway API not configured' });
    }

    const hostaway = new HostawayService(config.hostaway_api_key, config.hostaway_account_id);
    const { startDate, endDate } = req.query;

    const pricing = await hostaway.getPricing(req.params.hostawayId, startDate, endDate);
    res.json({ data: pricing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
