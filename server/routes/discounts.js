const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/discounts
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/discounts
router.post('/', async (req, res) => {
  try {
    const discountData = { ...req.body };
    discountData.code = discountData.code.toUpperCase().replace(/\s/g, '');

    if (discountData.applicable_properties && typeof discountData.applicable_properties !== 'string') {
      discountData.applicable_properties = JSON.stringify(discountData.applicable_properties);
    }

    const { data, error } = await supabase
      .from('discount_codes')
      .insert(discountData)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/discounts/:id
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('discount_codes')
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

// DELETE /api/discounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('discount_codes')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/discounts/validate - Validate a discount code
router.post('/validate', async (req, res) => {
  try {
    const { code, nights, property_id } = req.body;

    const { data: discount, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !discount) {
      return res.status(404).json({ error: 'Invalid discount code' });
    }

    // Check validity
    const now = new Date();
    if (discount.valid_from && new Date(discount.valid_from) > now) {
      return res.status(400).json({ error: 'Discount code is not yet active' });
    }
    if (discount.valid_until && new Date(discount.valid_until) < now) {
      return res.status(400).json({ error: 'Discount code has expired' });
    }
    if (discount.max_uses > 0 && discount.times_used >= discount.max_uses) {
      return res.status(400).json({ error: 'Discount code has reached maximum uses' });
    }
    if (discount.min_nights && nights < discount.min_nights) {
      return res.status(400).json({ error: `Minimum ${discount.min_nights} nights required` });
    }

    res.json({ data: discount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
