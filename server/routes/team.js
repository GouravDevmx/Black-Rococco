const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/team
router.get('/', async (req, res) => {
  try {
    const { is_active } = req.query;
    let query = supabase.from('team_members').select('*').order('name');
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('team_members').insert(req.body).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/:id
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('team_members').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/team/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('team_members').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
