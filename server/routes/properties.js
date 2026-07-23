const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/properties
router.get('/', async (req, res) => {
  try {
    const { search, city, min_price, max_price, bedrooms, is_active } = req.query;

    let query = supabase
      .from('properties')
      .select('*')
      .order('name', { ascending: true });

    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (city) query = query.ilike('city', `%${city}%`);
    if (bedrooms) query = query.gte('bedrooms', parseInt(bedrooms));
    if (min_price) query = query.gte('base_price', parseFloat(min_price));
    if (max_price) query = query.lte('base_price', parseFloat(max_price));
    if (search) query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/properties/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Property not found' });
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/properties/:id (update overrides)
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/properties (manually add)
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .insert(req.body)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
