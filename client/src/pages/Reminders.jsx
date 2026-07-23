import React, { useState, useEffect } from 'react';
import { Bell, Plus, Check, Trash2, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function Reminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', reminder_type: 'follow_up',
    client_id: '', quote_id: '', notify_whatsapp: false, notify_email: false,
  });

  useEffect(() => { loadReminders(); loadDeps(); }, [filter]);

  async function loadDeps() {
    try {
      const [c, q] = await Promise.all([api.getClients({}), api.getQuotes({})]);
      setClients(c.data || []);
      setQuotes(q.data || []);
    } catch (err) { console.error(err); }
  }

  async function loadReminders() {
    try {
      const params = {};
      if (filter === 'pending') params.is_completed = 'false';
      else if (filter === 'completed') params.is_completed = 'true';
      else if (filter === 'today') params.due_today = 'true';
      const res = await api.getReminders(params);
      setReminders(res.data || []);
    } catch (err) { toast.error('Failed to load reminders'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const data = { ...form };
      if (!data.client_id) delete data.client_id;
      if (!data.quote_id) delete data.quote_id;
      await api.createReminder(data);
      toast.success('Reminder created');
      setShowModal(false);
      setForm({ title: '', description: '', due_date: '', reminder_type: 'follow_up', client_id: '', quote_id: '', notify_whatsapp: false, notify_email: false });
      loadReminders();
    } catch (err) { toast.error(err.message); }
  }

  async function handleComplete(id) {
    try {
      await api.updateReminder(id, { is_completed: true });
      toast.success('Completed');
      loadReminders();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this reminder?')) return;
    try {
      await api.deleteReminder(id);
      toast.success('Deleted');
      loadReminders();
    } catch (err) { toast.error(err.message); }
  }

  const typeColors = {
    follow_up: 'bg-blue-100 text-blue-700',
    quote_expiry: 'bg-orange-100 text-orange-700',
    check_in: 'bg-green-100 text-green-700',
    check_out: 'bg-purple-100 text-purple-700',
    renewal: 'bg-amber-100 text-amber-700',
    custom: 'bg-gray-100 text-gray-700',
  };

  function isOverdue(dateStr) {
    return new Date(dateStr) < new Date() && !reminders.find(r => r.due_date === dateStr)?.is_completed;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reminders</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Reminder</button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['pending', 'today', 'completed', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center text-gray-400 py-12">Loading...</div> : reminders.length === 0 ? (
        <div className="card p-12 text-center">
          <Bell size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No reminders</h3>
          <button onClick={() => setShowModal(true)} className="btn-primary">Create one</button>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map(r => (
            <div key={r.id} className={`card p-4 flex items-center gap-4 ${r.is_completed ? 'opacity-60' : ''}`}>
              <button
                onClick={() => !r.is_completed && handleComplete(r.id)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  r.is_completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-brand-500'
                }`}
              >
                {r.is_completed && <Check size={14} />}
              </button>

              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${r.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</div>
                {r.description && <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${typeColors[r.reminder_type] || 'bg-gray-100'}`}>
                    {r.reminder_type.replace('_', ' ')}
                  </span>
                  {r.clients?.company_name && <span className="text-[10px] text-gray-400">{r.clients.company_name}</span>}
                  {r.quotes?.quote_number && <span className="text-[10px] text-gray-400">{r.quotes.quote_number}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className={`text-xs font-medium flex items-center gap-1 ${
                  isOverdue(r.due_date) ? 'text-red-500' : 'text-gray-500'
                }`}>
                  <Clock size={12} />
                  {new Date(r.due_date).toLocaleDateString()}
                </div>
              </div>

              <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-lg">New Reminder</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input className="input-field" required placeholder="Follow up on quote..." value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input-field" rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Due Date *</label>
                  <input className="input-field" type="date" required value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input-field" value={form.reminder_type} onChange={e => setForm({...form, reminder_type: e.target.value})}>
                    <option value="follow_up">Follow Up</option>
                    <option value="quote_expiry">Quote Expiry</option>
                    <option value="check_in">Check-in</option>
                    <option value="check_out">Check-out</option>
                    <option value="renewal">Renewal</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Client</label>
                  <select className="input-field" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})}>
                    <option value="">None</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Quote</label>
                  <select className="input-field" value={form.quote_id} onChange={e => setForm({...form, quote_id: e.target.value})}>
                    <option value="">None</option>
                    {quotes.map(q => <option key={q.id} value={q.id}>{q.quote_number}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Create Reminder</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
