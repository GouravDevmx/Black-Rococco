const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const PDFService = require('../services/pdf');
const NotificationService = require('../services/notifications');

// GET /api/quotes
router.get('/', async (req, res) => {
  try {
    const { client_id, status, search } = req.query;
    let query = supabase
      .from('quotes')
      .select('*, properties(name, city, thumbnail_url), clients(company_name), contacts(first_name, last_name, email)')
      .order('created_at', { ascending: false });

    if (client_id) query = query.eq('client_id', client_id);
    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('quote_number', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/quotes/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, properties(*), clients(*, contacts(*)), contacts(*)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Quote not found' });
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/quotes
router.post('/', async (req, res) => {
  try {
    const quoteData = { ...req.body };

    // Calculate pricing
    const nights = Math.ceil(
      (new Date(quoteData.check_out) - new Date(quoteData.check_in)) / (1000 * 60 * 60 * 24)
    );
    const nightlyTotal = (parseFloat(quoteData.nightly_rate) || 0) * nights;
    const cleaningFee = parseFloat(quoteData.cleaning_fee) || 0;

    // Extra charges total
    const extras = quoteData.extra_charges || [];
    const extrasTotal = extras.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const subtotal = nightlyTotal + cleaningFee + extrasTotal;

    // Discount
    let discountAmount = 0;
    if (quoteData.discount_type === 'percentage') {
      discountAmount = subtotal * (parseFloat(quoteData.discount_value) || 0) / 100;
    } else if (quoteData.discount_type === 'fixed') {
      discountAmount = parseFloat(quoteData.discount_value) || 0;
    }

    // If using a discount code
    if (quoteData.discount_code) {
      const { data: discCode } = await supabase
        .from('discount_codes')
        .select('*')
        .eq('code', quoteData.discount_code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (discCode) {
        if (discCode.min_nights && nights < discCode.min_nights) {
          return res.status(400).json({ error: `Discount code requires minimum ${discCode.min_nights} nights` });
        }
        if (discCode.max_uses > 0 && discCode.times_used >= discCode.max_uses) {
          return res.status(400).json({ error: 'Discount code has reached maximum uses' });
        }

        quoteData.discount_code_id = discCode.id;
        quoteData.discount_type = discCode.discount_type;
        quoteData.discount_value = discCode.discount_value;

        if (discCode.discount_type === 'percentage') {
          discountAmount = subtotal * discCode.discount_value / 100;
        } else {
          discountAmount = discCode.discount_value;
        }

        // Increment usage
        await supabase
          .from('discount_codes')
          .update({ times_used: discCode.times_used + 1 })
          .eq('id', discCode.id);
      }
    }

    const afterDiscount = subtotal - discountAmount;
    const taxRate = parseFloat(quoteData.tax_rate) || 0;
    const taxAmount = afterDiscount * taxRate / 100;
    const total = afterDiscount + taxAmount;

    // Get config for validity days
    const { data: config } = await supabase
      .from('company_config')
      .select('pdf_quote_validity_days')
      .single();

    const validityDays = config?.pdf_quote_validity_days || 14;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    const finalQuote = {
      ...quoteData,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
      valid_until: validUntil.toISOString().split('T')[0],
      extra_charges: JSON.stringify(extras),
    };

    // Remove transient fields
    delete finalQuote.discount_code;
    delete finalQuote.quote_number;

    const { data, error } = await supabase
      .from('quotes')
      .insert(finalQuote)
      .select('*, properties(name), clients(company_name)')
      .single();

    if (error) throw error;

    await supabase.from('activity_log').insert({
      entity_type: 'quote',
      entity_id: data.id,
      action: 'created',
      details: { quote_number: data.quote_number, total: data.total },
    });

    res.json({ data });
  } catch (error) {
    console.error('Quote creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/quotes/:id
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.extra_charges && typeof updates.extra_charges !== 'string') {
      updates.extra_charges = JSON.stringify(updates.extra_charges);
    }

    // Check if status is changing to 'sent'
    const isBeingSent = updates.status === 'sent';
    if (isBeingSent) {
      // Check current status to avoid duplicate reminders
      const { data: current } = await supabase
        .from('quotes').select('status').eq('id', req.params.id).single();
      
      if (current?.status !== 'sent') {
        updates.sent_at = new Date().toISOString();
      } else {
        // Already sent before, don't create duplicate reminders
        updates._alreadySent = true;
      }
    }

    const alreadySent = updates._alreadySent;
    delete updates._alreadySent;

    const { data, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Auto-create reminders when quote is first sent
    if (isBeingSent && !alreadySent) {
      try {
        await NotificationService.createAutoReminders(req.params.id);
      } catch (e) {
        console.error('Auto-reminder creation failed:', e.message);
        // Don't fail the whole request
      }
    }

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/quotes/:id/pdf - Generate PDF
router.post('/:id/pdf', async (req, res) => {
  try {
    // Fetch all needed data
    const { data: quote, error: qError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (qError) throw qError;

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', quote.property_id)
      .single();

    let client = null, contact = null;
    if (quote.client_id) {
      const { data: c } = await supabase.from('clients').select('*').eq('id', quote.client_id).single();
      client = c;
    }
    if (quote.contact_id) {
      const { data: c } = await supabase.from('contacts').select('*').eq('id', quote.contact_id).single();
      contact = c;
    }

    const { data: config } = await supabase
      .from('company_config')
      .select('*')
      .single();

    const pdfService = new PDFService(config);
    const pdfBuffer = await pdfService.generateQuotePDF(quote, property, client, contact);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Quote-${quote.quote_number}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/quotes/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { data: original, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    const { id, quote_number, created_at, updated_at, ...quoteData } = original;
    quoteData.status = 'draft';
    quoteData.pdf_url = '';

    const { data: newQuote, error: insertError } = await supabase
      .from('quotes')
      .insert(quoteData)
      .select()
      .single();

    if (insertError) throw insertError;
    res.json({ data: newQuote });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
