import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', email: '', phone: '', whatsapp: '', position: '' });

  useEffect(() => { loadClient(); }, [id]);

  async function loadClient() {
    try {
      const res = await api.getClient(id);
      setClient(res.data);
      setEditForm(res.data);
    } catch (err) { toast.error('Failed to load client'); }
  }

  async function handleUpdate() {
    try {
      const { contacts, quotes, ...data } = editForm;
      await api.updateClient(id, data);
      toast.success('Client updated');
      setEditing(false);
      loadClient();
    } catch (err) { toast.error(err.message); }
  }

  async function handleAddContact(e) {
    e.preventDefault();
    try {
      await api.createContact(id, contactForm);
      toast.success('Contact added');
      setShowContactForm(false);
      setContactForm({ first_name: '', last_name: '', email: '', phone: '', whatsapp: '', position: '' });
      loadClient();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDeleteContact(contactId) {
    if (!confirm('Delete this contact?')) return;
    try {
      await api.deleteContact(id, contactId);
      toast.success('Contact deleted');
      loadClient();
    } catch (err) { toast.error(err.message); }
  }

  if (!client) return <div className="text-center text-gray-400 py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/clients')} className="p-1 hover:bg-gray-100 rounded"><ArrowLeft size={20} /></button>
        <h1 className="text-2xl font-bold text-gray-900">{client.company_name}</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Client Info */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Company Details</h2>
            {editing ? (
              <div className="flex gap-2">
                <button onClick={handleUpdate} className="btn-primary text-xs flex items-center gap-1"><Check size={14} /> Save</button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-xs">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} className="btn-secondary text-xs flex items-center gap-1"><Edit2 size={14} /> Edit</button>
            )}
          </div>

          {editing ? (
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Company Name</label><input className="input-field" value={editForm.company_name} onChange={e => setEditForm({...editForm, company_name: e.target.value})} /></div>
              <div><label className="label">Industry</label><input className="input-field" value={editForm.industry || ''} onChange={e => setEditForm({...editForm, industry: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Billing Address</label><input className="input-field" value={editForm.billing_address || ''} onChange={e => setEditForm({...editForm, billing_address: e.target.value})} /></div>
              <div><label className="label">Tax ID</label><input className="input-field" value={editForm.tax_id || ''} onChange={e => setEditForm({...editForm, tax_id: e.target.value})} /></div>
              <div><label className="label">Negotiated Discount %</label><input className="input-field" type="number" value={editForm.negotiated_discount || 0} onChange={e => setEditForm({...editForm, negotiated_discount: e.target.value})} /></div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input-field" rows="3" value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} /></div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-gray-500">Industry</dt><dd className="font-medium">{client.industry || '—'}</dd></div>
              <div><dt className="text-gray-500">Referral Source</dt><dd className="font-medium">{client.referral_source || '—'}</dd></div>
              <div className="col-span-2"><dt className="text-gray-500">Billing Address</dt><dd className="font-medium">{client.billing_address || '—'}</dd></div>
              <div><dt className="text-gray-500">Tax ID</dt><dd className="font-medium">{client.tax_id || '—'}</dd></div>
              <div><dt className="text-gray-500">Referral Code</dt><dd className="font-medium text-brand-600">{client.referral_code || '—'}</dd></div>
              <div><dt className="text-gray-500">Negotiated Discount</dt><dd className="font-medium text-green-600">{client.negotiated_discount ? `${client.negotiated_discount}%` : '—'}</dd></div>
              {client.notes && <div className="col-span-2"><dt className="text-gray-500">Notes</dt><dd className="font-medium">{client.notes}</dd></div>}
            </dl>
          )}
        </div>

        {/* Contacts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Contacts</h2>
            <button onClick={() => setShowContactForm(!showContactForm)} className="text-brand-600 hover:text-brand-700"><Plus size={18} /></button>
          </div>

          {showContactForm && (
            <form onSubmit={handleAddContact} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input-field text-xs" placeholder="First name *" required value={contactForm.first_name} onChange={e => setContactForm({...contactForm, first_name: e.target.value})} />
                <input className="input-field text-xs" placeholder="Last name" value={contactForm.last_name} onChange={e => setContactForm({...contactForm, last_name: e.target.value})} />
              </div>
              <input className="input-field text-xs" placeholder="Email" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} />
              <input className="input-field text-xs" placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} />
              <input className="input-field text-xs" placeholder="Position" value={contactForm.position} onChange={e => setContactForm({...contactForm, position: e.target.value})} />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-xs flex-1">Add</button>
                <button type="button" onClick={() => setShowContactForm(false)} className="btn-secondary text-xs">Cancel</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {(client.contacts || []).length === 0 ? (
              <p className="text-xs text-gray-400">No contacts yet.</p>
            ) : client.contacts.map(c => (
              <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{c.first_name} {c.last_name}</div>
                  <button onClick={() => handleDeleteContact(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
                {c.position && <div className="text-xs text-gray-500">{c.position}</div>}
                {c.email && <div className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Mail size={11} />{c.email}</div>}
                {c.phone && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Phone size={11} />{c.phone}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quote History */}
      <div className="card">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold">Quote History</h2>
          <Link to={`/quotes/new?client=${id}`} className="btn-primary text-xs flex items-center gap-1"><Plus size={14} /> New Quote</Link>
        </div>
        {(client.quotes || []).length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No quotes yet for this client.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Quote #</th>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Property</th>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Status</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">Total</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {client.quotes.map(q => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{q.quote_number}</td>
                  <td className="px-4 py-3 text-gray-500">{q.properties?.name || '—'}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{q.status}</span></td>
                  <td className="px-4 py-3 text-right font-medium">${parseFloat(q.total).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{new Date(q.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
