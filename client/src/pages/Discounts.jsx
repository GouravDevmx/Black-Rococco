import React, { useState, useEffect } from 'react';
import { Tags, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: 0,
    min_nights: 0, max_uses: 0, valid_from: '', valid_until: '',
  });

  useEffect(() => { loadDiscounts(); }, []);

  async function loadDiscounts() {
    try {
      const res = await api.getDiscounts();
      setDiscounts(res.data || []);
    } catch (err) { toast.error('Failed to load discounts'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.createDiscount(form);
      toast.success('Discount code created');
      setShowModal(false);
      setForm({ code: '', description: '', discount_type: 'percentage', discount_value: 0, min_nights: 0, max_uses: 0, valid_from: '', valid_until: '' });
      loadDiscounts();
    } catch (err) { toast.error(err.message); }
  }

  async function toggleActive(disc) {
    try {
      await api.updateDiscount(disc.id, { is_active: !disc.is_active });
      toast.success(disc.is_active ? 'Deactivated' : 'Activated');
      loadDiscounts();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this discount code?')) return;
    try {
      await api.deleteDiscount(id);
      toast.success('Deleted');
      loadDiscounts();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Discount Codes</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Create Code</button>
      </div>

      {loading ? <div className="text-center text-gray-400 py-12">Loading...</div> : discounts.length === 0 ? (
        <div className="card p-12 text-center">
          <Tags size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No discount codes yet</h3>
          <button onClick={() => setShowModal(true)} className="btn-primary">Create your first code</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {discounts.map(d => (
            <div key={d.id} className={`card p-4 ${!d.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="bg-brand-100 text-brand-700 font-mono font-bold text-lg px-3 py-1 rounded">{d.code}</div>
                <div className="flex gap-1">
                  <button onClick={() => toggleActive(d)} className={`text-xs px-2 py-1 rounded ${d.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => handleDelete(d.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                </div>
              </div>
              {d.description && <p className="text-xs text-gray-500 mb-3">{d.description}</p>}
              <div className="text-2xl font-bold text-gray-900 mb-2">
                {d.discount_type === 'percentage' ? `${d.discount_value}%` : `$${d.discount_value}`}
                <span className="text-sm font-normal text-gray-400 ml-1">off</span>
              </div>
              <div className="space-y-1 text-xs text-gray-500">
                {d.min_nights > 0 && <div>Min. {d.min_nights} nights</div>}
                <div>Used: {d.times_used}{d.max_uses > 0 ? ` / ${d.max_uses}` : ' (unlimited)'}</div>
                {d.valid_until && <div>Expires: {new Date(d.valid_until).toLocaleDateString()}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-lg">New Discount Code</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="label">Code *</label>
                <input className="input-field font-mono uppercase" required placeholder="e.g. CORP20" value={form.code} onChange={e => setForm({...form, code: e.target.value})} />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input-field" placeholder="20% off for corporate clients" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select className="input-field" value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value {form.discount_type === 'percentage' ? '(%)' : '($)'}</label>
                  <input className="input-field" type="number" min="0" required value={form.discount_value} onChange={e => setForm({...form, discount_value: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Min. Nights</label>
                  <input className="input-field" type="number" min="0" value={form.min_nights} onChange={e => setForm({...form, min_nights: e.target.value})} />
                </div>
                <div>
                  <label className="label">Max Uses (0 = unlimited)</label>
                  <input className="input-field" type="number" min="0" value={form.max_uses} onChange={e => setForm({...form, max_uses: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Valid From</label>
                  <input className="input-field" type="date" value={form.valid_from} onChange={e => setForm({...form, valid_from: e.target.value})} />
                </div>
                <div>
                  <label className="label">Valid Until</label>
                  <input className="input-field" type="date" value={form.valid_until} onChange={e => setForm({...form, valid_until: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Create</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
