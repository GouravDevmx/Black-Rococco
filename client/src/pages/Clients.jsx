import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Search, Building2, Mail, Phone, X, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [form, setForm] = useState({
    company_name: '', industry: '', billing_address: '', tax_id: '', website: '', notes: '',
    referral_source: '', negotiated_discount: 0, representative_id: '',
    contact_first_name: '', contact_last_name: '', contact_email: '', contact_phone: '', contact_position: '',
  });

  useEffect(() => { loadClients(); loadTeam(); }, []);

  async function loadClients() {
    try {
      const res = await api.getClients(search ? { search } : {});
      setClients(res.data || []);
    } catch (err) { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  }

  async function loadTeam() {
    try {
      const res = await api.getTeamMembers({ is_active: 'true' });
      setTeamMembers(res.data || []);
    } catch (err) { console.error(err); }
  }

  useEffect(() => {
    const t = setTimeout(loadClients, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const { contact_first_name, contact_last_name, contact_email, contact_phone, contact_position, ...clientData } = form;
      if (!clientData.representative_id) delete clientData.representative_id;
      const contacts = contact_first_name ? [{
        first_name: contact_first_name, last_name: contact_last_name,
        email: contact_email, phone: contact_phone, position: contact_position, is_primary: true,
      }] : [];
      await api.createClient({ ...clientData, contacts });
      toast.success('Client created');
      setShowModal(false);
      setForm({ company_name: '', industry: '', billing_address: '', tax_id: '', website: '', notes: '', referral_source: '', negotiated_discount: 0, representative_id: '', contact_first_name: '', contact_last_name: '', contact_email: '', contact_phone: '', contact_position: '' });
      loadClients();
    } catch (err) { toast.error(err.message); }
  }

  // Find rep name
  const getRepName = (repId) => {
    const rep = teamMembers.find(t => t.id === repId);
    return rep ? rep.name : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by company name or industry..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10" />
      </div>

      {loading ? <div className="text-center text-gray-400 py-12">Loading...</div> : clients.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No clients yet</h3>
          <p className="text-sm text-gray-400 mb-4">Add your first business client to start building quotes.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Add Client</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(c => (
            <Link key={c.id} to={`/clients/${c.id}`} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-brand-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{c.company_name}</h3>
                  {c.industry && <p className="text-xs text-gray-500">{c.industry}</p>}
                </div>
              </div>

              {c.contacts?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Mail size={11} /> {c.contacts[0].email || 'No email'}
                  </div>
                  {c.contacts[0].phone && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Phone size={11} /> {c.contacts[0].phone}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between flex-wrap gap-1">
                {c.referral_code && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">REF: {c.referral_code}</span>}
                {c.negotiated_discount > 0 && <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded">{c.negotiated_discount}% discount</span>}
                {c.representative_id && getRepName(c.representative_id) && (
                  <span className="text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded flex items-center gap-0.5">
                    <UserCheck size={9} /> {getRepName(c.representative_id)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-lg">New Client</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Company Name *</label>
                  <input className="input-field" required value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Industry</label>
                  <input className="input-field" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} />
                </div>
                <div>
                  <label className="label">Source</label>
                  <select className="input-field" value={form.referral_source} onChange={e => setForm({ ...form, referral_source: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="direct">Direct</option><option value="referral">Referral</option>
                    <option value="corporate">Corporate</option><option value="agent">Agent</option>
                    <option value="online">Online</option><option value="repeat">Repeat</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">Billing Address</label>
                  <input className="input-field" value={form.billing_address} onChange={e => setForm({ ...form, billing_address: e.target.value })} />
                </div>
                <div>
                  <label className="label">Tax ID</label>
                  <input className="input-field" value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} />
                </div>
                <div>
                  <label className="label">Negotiated Discount %</label>
                  <input className="input-field" type="number" min="0" max="100" value={form.negotiated_discount} onChange={e => setForm({ ...form, negotiated_discount: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Assigned Representative</label>
                  <select className="input-field" value={form.representative_id} onChange={e => setForm({ ...form, representative_id: e.target.value })}>
                    <option value="">No representative</option>
                    {teamMembers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.role})</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 mt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-3">Primary Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">First Name</label><input className="input-field" value={form.contact_first_name} onChange={e => setForm({ ...form, contact_first_name: e.target.value })} /></div>
                  <div><label className="label">Last Name</label><input className="input-field" value={form.contact_last_name} onChange={e => setForm({ ...form, contact_last_name: e.target.value })} /></div>
                  <div><label className="label">Email</label><input className="input-field" type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
                  <div><label className="label">Phone</label><input className="input-field" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
                  <div className="col-span-2"><label className="label">Position</label><input className="input-field" value={form.contact_position} onChange={e => setForm({ ...form, contact_position: e.target.value })} /></div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Create Client</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
