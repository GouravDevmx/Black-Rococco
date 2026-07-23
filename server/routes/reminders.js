const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/reminders
router.get('/', async (req, res) => {
  try {
    const { is_completed, due_today, upcoming } = req.query;
    let query = supabase
      .from('reminders')
      .select('*, quotes(quote_number, total, status), clients(company_name)')
      .order('due_date', { ascending: true });

    if (is_completed !== undefined) query = query.eq('is_completed', is_completed === 'true');

    if (due_today === 'true') {
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('due_date', today + 'T00:00:00')
        .lte('due_date', today + 'T23:59:59');
    }

    if (upcoming === 'true') {
      const now = new Date().toISOString();
      const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('due_date', now).lte('due_date', weekLater);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reminders
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reminders')
      .insert(req.body)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/reminders/:id
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.is_completed && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
