const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const { search, is_active } = req.query;
    let query = supabase
      .from('clients')
      .select('*, contacts(*)')
      .order('company_name', { ascending: true });

    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (search) query = query.or(`company_name.ilike.%${search}%,industry.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*, contacts(*)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Client not found' });

    // Also fetch quotes for this client
    const { data: quotes } = await supabase
      .from('quotes')
      .select('*, properties(name)')
      .eq('client_id', req.params.id)
      .order('created_at', { ascending: false });

    res.json({ data: { ...data, quotes: quotes || [] } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const { contacts: contactsData, ...clientData } = req.body;

    // Generate referral code
    if (!clientData.referral_code) {
      clientData.referral_code = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const { data: client, error } = await supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single();

    if (error) throw error;

    // Insert contacts if provided
    if (contactsData?.length) {
      const contacts = contactsData.map(c => ({ ...c, client_id: client.id }));
      await supabase.from('contacts').insert(contacts);
    }

    // Fetch complete client
    const { data: complete } = await supabase
      .from('clients')
      .select('*, contacts(*)')
      .eq('id', client.id)
      .single();

    await supabase.from('activity_log').insert({
      entity_type: 'client',
      entity_id: client.id,
      action: 'created',
      details: { company_name: client.company_name },
    });

    res.json({ data: complete });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res) => {
  try {
    const { contacts: contactsData, ...clientData } = req.body;

    const { data, error } = await supabase
      .from('clients')
      .update(clientData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── CONTACTS ──

// POST /api/clients/:id/contacts
router.post('/:id/contacts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .insert({ ...req.body, client_id: req.params.id })
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/clients/:clientId/contacts/:contactId
router.put('/:clientId/contacts/:contactId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .update(req.body)
      .eq('id', req.params.contactId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/clients/:clientId/contacts/:contactId
router.delete('/:clientId/contacts/:contactId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', req.params.contactId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
