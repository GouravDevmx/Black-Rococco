import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Download, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function QuoteBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [properties, setProperties] = useState([]);
  const [clients, setClients] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    property_id: '', client_id: searchParams.get('client') || '', contact_id: '',
    check_in: '', check_out: '', guests: 1,
    nightly_rate: 0, cleaning_fee: 0,
    discount_type: 'none', discount_value: 0, discount_code: '',
    tax_rate: 0, notes: '', internal_notes: '', currency: 'USD',
    extra_charges: [],
  });

  useEffect(() => {
    loadDeps();
    if (isEdit) loadQuote();
  }, [id]);

  async function loadDeps() {
    try {
      const [propRes, clientRes] = await Promise.all([
        api.getProperties({ is_active: 'true' }),
        api.getClients({}),
      ]);
      setProperties(propRes.data || []);
      setClients(clientRes.data || []);
    } catch (err) { console.error(err); }
  }

  async function loadQuote() {
    try {
      const res = await api.getQuote(id);
      const q = res.data;
      setForm({
        property_id: q.property_id || '',
        client_id: q.client_id || '',
        contact_id: q.contact_id || '',
        check_in: q.check_in || '',
        check_out: q.check_out || '',
        guests: q.guests || 1,
        nightly_rate: q.nightly_rate || 0,
        cleaning_fee: q.cleaning_fee || 0,
        discount_type: q.discount_type || 'none',
        discount_value: q.discount_value || 0,
        discount_code: '',
        tax_rate: q.tax_rate || 0,
        notes: q.notes || '',
        internal_notes: q.internal_notes || '',
        currency: q.currency || 'USD',
        extra_charges: typeof q.extra_charges === 'string' ? JSON.parse(q.extra_charges || '[]') : (q.extra_charges || []),
      });
      // Load contacts for selected client
      if (q.client_id) {
        const clientRes = await api.getClient(q.client_id);
        setContacts(clientRes.data?.contacts || []);
      }
    } catch (err) { toast.error('Failed to load quote'); }
  }

  // When property changes, auto-fill pricing
  function handlePropertyChange(propertyId) {
    const prop = properties.find(p => p.id === propertyId);
    if (prop) {
      setForm(f => ({
        ...f,
        property_id: propertyId,
        nightly_rate: prop.base_price || 0,
        cleaning_fee: prop.cleaning_fee || 0,
        currency: prop.currency || 'USD',
      }));
    } else {
      setForm(f => ({ ...f, property_id: propertyId }));
    }
  }

  // When client changes, load their contacts
  async function handleClientChange(clientId) {
    setForm(f => ({ ...f, client_id: clientId, contact_id: '' }));
    if (clientId) {
      try {
        const res = await api.getClient(clientId);
        setContacts(res.data?.contacts || []);
        // Auto-apply negotiated discount
        if (res.data?.negotiated_discount > 0) {
          setForm(f => ({
            ...f, client_id: clientId,
            discount_type: 'percentage',
            discount_value: res.data.negotiated_discount,
          }));
        }
      } catch (err) { setContacts([]); }
    } else {
      setContacts([]);
    }
  }

  // Calculate totals
  const nights = form.check_in && form.check_out
    ? Math.max(0, Math.ceil((new Date(form.check_out) - new Date(form.check_in)) / (1000 * 60 * 60 * 24)))
    : 0;
  const nightlyTotal = parseFloat(form.nightly_rate || 0) * nights;
  const cleaningFee = parseFloat(form.cleaning_fee || 0);
  const extrasTotal = form.extra_charges.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const subtotal = nightlyTotal + cleaningFee + extrasTotal;

  let discountAmount = 0;
  if (form.discount_type === 'percentage') discountAmount = subtotal * parseFloat(form.discount_value || 0) / 100;
  else if (form.discount_type === 'fixed') discountAmount = parseFloat(form.discount_value || 0);

  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * parseFloat(form.tax_rate || 0) / 100;
  const total = afterDiscount + taxAmount;

  // Extra charges
  function addExtra() {
    setForm(f => ({ ...f, extra_charges: [...f.extra_charges, { description: '', amount: 0, quantity: 1, rate: 0 }] }));
  }
  function updateExtra(idx, field, value) {
    const extras = [...form.extra_charges];
    extras[idx][field] = value;
    if (field === 'rate' || field === 'quantity') {
      extras[idx].amount = parseFloat(extras[idx].rate || 0) * parseInt(extras[idx].quantity || 1);
    }
    setForm(f => ({ ...f, extra_charges: extras }));
  }
  function removeExtra(idx) {
    setForm(f => ({ ...f, extra_charges: f.extra_charges.filter((_, i) => i !== idx) }));
  }

  // Validate discount code
  async function validateCode() {
    if (!form.discount_code) return;
    try {
      const res = await api.validateDiscount({ code: form.discount_code, nights, property_id: form.property_id });
      const d = res.data;
      setForm(f => ({
        ...f,
        discount_type: d.discount_type,
        discount_value: d.discount_value,
      }));
      toast.success(`Code applied: ${d.discount_type === 'percentage' ? d.discount_value + '%' : '$' + d.discount_value} off`);
    } catch (err) {
      toast.error(err.message || 'Invalid code');
    }
  }

  async function handleSave() {
    if (!form.property_id) return toast.error('Select a property');
    if (!form.check_in || !form.check_out) return toast.error('Select dates');
    if (nights <= 0) return toast.error('Check-out must be after check-in');

    setSaving(true);
    try {
      if (isEdit) {
        await api.updateQuote(id, form);
        toast.success('Quote updated');
      } else {
        const res = await api.createQuote(form);
        toast.success('Quote created');
        navigate(`/quotes/${res.data.id}/edit`);
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleDownloadPDF() {
    const quoteId = id;
    if (!quoteId) return toast.error('Save the quote first');
    try {
      toast.loading('Generating PDF...');
      const response = await api.generatePDF(quoteId);
      if (!response.ok) throw new Error('PDF generation failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Quote.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success('PDF downloaded');
    } catch (err) {
      toast.dismiss();
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quotes')} className="p-1 hover:bg-gray-100 rounded"><ArrowLeft size={20} /></button>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Quote' : 'New Quote'}</h1>
        </div>
        <div className="flex gap-2">
          {isEdit && (
            <button onClick={handleDownloadPDF} className="btn-secondary flex items-center gap-2">
              <Download size={16} /> Download PDF
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : isEdit ? 'Update Quote' : 'Create Quote'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Property & Client */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Property & Client</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Property *</label>
                <select className="input-field" value={form.property_id} onChange={e => handlePropertyChange(e.target.value)}>
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.city || ''} ({p.currency} {parseFloat(p.base_price).toFixed(0)}/night)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Client</label>
                <select className="input-field" value={form.client_id} onChange={e => handleClientChange(e.target.value)}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              {contacts.length > 0 && (
                <div>
                  <label className="label">Contact</label>
                  <select className="input-field" value={form.contact_id} onChange={e => setForm({...form, contact_id: e.target.value})}>
                    <option value="">Select contact...</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.email}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Booking Details</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Check-in *</label>
                <input type="date" className="input-field" value={form.check_in} onChange={e => setForm({...form, check_in: e.target.value})} />
              </div>
              <div>
                <label className="label">Check-out *</label>
                <input type="date" className="input-field" value={form.check_out} onChange={e => setForm({...form, check_out: e.target.value})} />
              </div>
              <div>
                <label className="label">Guests</label>
                <input type="number" className="input-field" min="1" value={form.guests} onChange={e => setForm({...form, guests: parseInt(e.target.value)})} />
              </div>
            </div>
            {nights > 0 && <p className="text-sm text-gray-500">{nights} night{nights !== 1 ? 's' : ''}</p>}
          </div>

          {/* Pricing */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Pricing</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Nightly Rate ({form.currency})</label>
                <input type="number" className="input-field" min="0" step="0.01" value={form.nightly_rate} onChange={e => setForm({...form, nightly_rate: e.target.value})} />
              </div>
              <div>
                <label className="label">Cleaning Fee</label>
                <input type="number" className="input-field" min="0" step="0.01" value={form.cleaning_fee} onChange={e => setForm({...form, cleaning_fee: e.target.value})} />
              </div>
              <div>
                <label className="label">Tax Rate %</label>
                <input type="number" className="input-field" min="0" step="0.01" value={form.tax_rate} onChange={e => setForm({...form, tax_rate: e.target.value})} />
              </div>
            </div>

            {/* Extra Charges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Extra Charges</label>
                <button onClick={addExtra} className="text-brand-600 hover:text-brand-700 text-xs flex items-center gap-1"><Plus size={14} /> Add</button>
              </div>
              {form.extra_charges.map((extra, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <input className="input-field flex-1" placeholder="Description" value={extra.description} onChange={e => updateExtra(idx, 'description', e.target.value)} />
                  <input className="input-field w-20" type="number" placeholder="Qty" value={extra.quantity} onChange={e => updateExtra(idx, 'quantity', e.target.value)} />
                  <input className="input-field w-24" type="number" placeholder="Rate" value={extra.rate} onChange={e => updateExtra(idx, 'rate', e.target.value)} />
                  <div className="input-field w-24 bg-gray-50 flex items-center text-sm text-gray-600">{parseFloat(extra.amount || 0).toFixed(2)}</div>
                  <button onClick={() => removeExtra(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>

            {/* Discount */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Discount</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select className="input-field" value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})}>
                    <option value="none">No Discount</option>
                    <option value="percentage">Percentage %</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                {form.discount_type !== 'none' && (
                  <div>
                    <label className="label">{form.discount_type === 'percentage' ? 'Percentage' : 'Amount'}</label>
                    <input type="number" className="input-field" min="0" step="0.01" value={form.discount_value} onChange={e => setForm({...form, discount_value: e.target.value})} />
                  </div>
                )}
                <div>
                  <label className="label">Discount Code</label>
                  <div className="flex gap-2">
                    <input className="input-field" placeholder="e.g. CORP20" value={form.discount_code} onChange={e => setForm({...form, discount_code: e.target.value})} />
                    <button onClick={validateCode} className="btn-secondary text-xs whitespace-nowrap"><Tag size={14} /> Apply</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Notes</h2>
            <div>
              <label className="label">Client-facing Notes (shown on PDF)</label>
              <textarea className="input-field" rows="3" placeholder="Any special arrangements, welcome notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
            <div>
              <label className="label">Internal Notes (not on PDF)</label>
              <textarea className="input-field" rows="2" placeholder="Internal team notes..." value={form.internal_notes} onChange={e => setForm({...form, internal_notes: e.target.value})} />
            </div>
          </div>
        </div>

        {/* Right: Live Summary */}
        <div className="lg:col-span-1">
          <div className="card p-5 sticky top-4">
            <h2 className="font-semibold text-gray-900 mb-4">Quote Summary</h2>

            {form.property_id && (
              <div className="mb-4 pb-4 border-b border-gray-100">
                <div className="font-medium text-sm">{properties.find(p => p.id === form.property_id)?.name || 'Property'}</div>
                {nights > 0 && <div className="text-xs text-gray-500 mt-1">{nights} night{nights !== 1 ? 's' : ''} · {form.guests} guest{form.guests !== 1 ? 's' : ''}</div>}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Accommodation ({nights} × {form.currency} {parseFloat(form.nightly_rate || 0).toFixed(2)})</span>
                <span className="font-medium">{form.currency} {nightlyTotal.toFixed(2)}</span>
              </div>

              {cleaningFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cleaning Fee</span>
                  <span className="font-medium">{form.currency} {cleaningFee.toFixed(2)}</span>
                </div>
              )}

              {form.extra_charges.filter(e => e.amount > 0).map((e, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-gray-500">{e.description || 'Extra'}</span>
                  <span className="font-medium">{form.currency} {parseFloat(e.amount).toFixed(2)}</span>
                </div>
              ))}

              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-700 font-medium">Subtotal</span>
                <span className="font-semibold">{form.currency} {subtotal.toFixed(2)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount {form.discount_type === 'percentage' ? `(${form.discount_value}%)` : ''}</span>
                  <span className="font-medium">-{form.currency} {discountAmount.toFixed(2)}</span>
                </div>
              )}

              {taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax ({form.tax_rate}%)</span>
                  <span className="font-medium">{form.currency} {taxAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between pt-3 border-t-2 border-gray-200">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-lg font-bold text-brand-700">{form.currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
