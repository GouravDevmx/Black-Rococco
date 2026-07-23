import React, { useState, useEffect } from 'react';
import { Save, Palette, FileText, Key, Building2, Bell, Users, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('company');
  const [teamMembers, setTeamMembers] = useState([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', email: '', phone: '', whatsapp: '', role: 'representative' });

  useEffect(() => { loadConfig(); loadTeam(); }, []);

  async function loadConfig() {
    try {
      const res = await api.getConfig();
      setConfig(res.data);
    } catch (err) { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  }

  async function loadTeam() {
    try {
      const res = await api.getTeamMembers({});
      setTeamMembers(res.data || []);
    } catch (err) { console.error(err); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateConfig(config);
      toast.success('Settings saved');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  function update(field, value) {
    setConfig(prev => ({ ...prev, [field]: value }));
  }

  async function handleAddTeam(e) {
    e.preventDefault();
    try {
      await api.createTeamMember(teamForm);
      toast.success('Team member added');
      setShowTeamModal(false);
      setTeamForm({ name: '', email: '', phone: '', whatsapp: '', role: 'representative' });
      loadTeam();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDeleteTeam(id) {
    if (!confirm('Delete this team member?')) return;
    try {
      await api.deleteTeamMember(id);
      toast.success('Deleted');
      loadTeam();
    } catch (err) { toast.error(err.message); }
  }

  // Auto-reminder intervals
  const intervals = config?.auto_reminder_intervals || [];
  function addInterval() {
    const updated = [...intervals, { days: 1, channel: 'email', label: 'Follow-up' }];
    update('auto_reminder_intervals', updated);
  }
  function updateInterval(idx, field, value) {
    const updated = [...intervals];
    updated[idx] = { ...updated[idx], [field]: field === 'days' ? parseInt(value) : value };
    update('auto_reminder_intervals', updated);
  }
  function removeInterval(idx) {
    update('auto_reminder_intervals', intervals.filter((_, i) => i !== idx));
  }

  const tabs = [
    { id: 'company', label: 'Company', icon: Building2 },
    { id: 'pdf', label: 'PDF Format', icon: FileText },
    { id: 'colors', label: 'Colors', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'api', label: 'API Keys', icon: Key },
  ];

  if (loading) return <div className="text-center text-gray-400 py-12">Loading settings...</div>;
  if (!config) return <div className="text-center text-gray-400 py-12">No config found.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Company Information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="label">Company Name</label><input className="input-field" value={config.company_name || ''} onChange={e => update('company_name', e.target.value)} /></div>
            <div><label className="label">Email</label><input className="input-field" type="email" value={config.company_email || ''} onChange={e => update('company_email', e.target.value)} /></div>
            <div><label className="label">Phone</label><input className="input-field" value={config.company_phone || ''} onChange={e => update('company_phone', e.target.value)} /></div>
            <div><label className="label">Website</label><input className="input-field" value={config.company_website || ''} onChange={e => update('company_website', e.target.value)} /></div>
            <div><label className="label">Address</label><input className="input-field" value={config.company_address || ''} onChange={e => update('company_address', e.target.value)} /></div>
            <div className="sm:col-span-2">
              <label className="label">Logo URL</label>
              <input className="input-field" placeholder="https://yoursite.com/logo.png" value={config.logo_url || ''} onChange={e => update('logo_url', e.target.value)} />
              {config.logo_url && <div className="mt-3 p-4 bg-gray-50 rounded-lg inline-block"><img src={config.logo_url} alt="Logo" className="max-h-16" onError={e => e.target.style.display='none'} /></div>}
            </div>
          </div>
        </div>
      )}

      {/* PDF Tab */}
      {activeTab === 'pdf' && (
        <div className="card p-6 space-y-6">
          <h2 className="font-semibold text-gray-900">PDF Layout</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><label className="label">Logo Position</label><select className="input-field" value={config.pdf_logo_position || 'left'} onChange={e => update('pdf_logo_position', e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
            <div><label className="label">Logo Width (px)</label><input className="input-field" type="number" min="50" max="400" value={config.pdf_logo_width || 150} onChange={e => update('pdf_logo_width', parseInt(e.target.value))} /></div>
            <div><label className="label">Page Size</label><select className="input-field" value={config.pdf_page_size || 'A4'} onChange={e => update('pdf_page_size', e.target.value)}><option value="A4">A4</option><option value="Letter">US Letter</option></select></div>
            <div><label className="label">Quote Validity (days)</label><input className="input-field" type="number" min="1" value={config.pdf_quote_validity_days || 14} onChange={e => update('pdf_quote_validity_days', parseInt(e.target.value))} /></div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={config.pdf_show_header_line} onChange={e => update('pdf_show_header_line', e.target.checked)} /><span className="text-sm">Show header divider line</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={config.pdf_show_footer} onChange={e => update('pdf_show_footer', e.target.checked)} /><span className="text-sm">Show footer text</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={config.pdf_show_property_image} onChange={e => update('pdf_show_property_image', e.target.checked)} /><span className="text-sm">Show property image</span></label>
          </div>
          <div><label className="label">Footer Text</label><textarea className="input-field" rows="2" value={config.pdf_footer_text || ''} onChange={e => update('pdf_footer_text', e.target.value)} /></div>
          <div><label className="label">Payment Instructions</label><textarea className="input-field" rows="3" value={config.pdf_payment_instructions || ''} onChange={e => update('pdf_payment_instructions', e.target.value)} /></div>
          <div><label className="label">Terms & Conditions</label><textarea className="input-field" rows="4" value={config.pdf_terms_conditions || ''} onChange={e => update('pdf_terms_conditions', e.target.value)} /></div>
        </div>
      )}

      {/* Colors Tab */}
      {activeTab === 'colors' && (
        <div className="card p-6 space-y-6">
          <h2 className="font-semibold text-gray-900">PDF Colors</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { field: 'pdf_primary_color', label: 'Primary', desc: 'Headings, total bar', def: '#1a365d' },
              { field: 'pdf_secondary_color', label: 'Secondary', desc: 'Body text', def: '#2d3748' },
              { field: 'pdf_accent_color', label: 'Accent', desc: 'Header line', def: '#3182ce' },
            ].map(({ field, label, desc, def }) => (
              <div key={field}>
                <label className="label">{label}</label>
                <p className="text-xs text-gray-400 mb-2">{desc}</p>
                <div className="flex items-center gap-3">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer border-0" value={config[field] || def} onChange={e => update(field, e.target.value)} />
                  <input className="input-field flex-1 font-mono text-sm" value={config[field] || def} onChange={e => update(field, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div className="border rounded-lg p-4 mt-4 space-y-2">
            <div className="h-8 rounded flex items-center px-4 text-white text-sm font-medium" style={{backgroundColor:config.pdf_primary_color||'#1a365d'}}>Primary</div>
            <div className="h-8 rounded flex items-center px-4 text-white text-sm" style={{backgroundColor:config.pdf_secondary_color||'#2d3748'}}>Secondary</div>
            <div className="h-1.5 rounded" style={{backgroundColor:config.pdf_accent_color||'#3182ce'}} />
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* Auto-Reminders */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Auto-Reminders</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={config.auto_reminder_enabled} onChange={e => update('auto_reminder_enabled', e.target.checked)} />
                <span className="text-sm font-medium">{config.auto_reminder_enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
            <p className="text-sm text-gray-500">When a quote is marked as "Sent", these follow-up reminders are created automatically.</p>

            {intervals.map((interval, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">After (days)</label>
                    <input className="input-field" type="number" min="1" value={interval.days} onChange={e => updateInterval(idx, 'days', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">Channel</label>
                    <select className="input-field" value={interval.channel} onChange={e => updateInterval(idx, 'channel', e.target.value)}>
                      <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="both">Both</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase">Label</label>
                    <input className="input-field" value={interval.label} onChange={e => updateInterval(idx, 'label', e.target.value)} />
                  </div>
                </div>
                <button onClick={() => removeInterval(idx)} className="text-red-400 hover:text-red-600 mt-4"><Trash2 size={16} /></button>
              </div>
            ))}
            <button onClick={addInterval} className="text-brand-600 text-sm flex items-center gap-1 hover:text-brand-700"><Plus size={14} /> Add Interval</button>
          </div>

          {/* SMTP */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Email (SMTP) Settings</h2>
            <p className="text-sm text-gray-500">Configure SMTP to send quotes and reminders by email.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">SMTP Host</label><input className="input-field" placeholder="smtp.gmail.com" value={config.smtp_host || ''} onChange={e => update('smtp_host', e.target.value)} /></div>
              <div><label className="label">SMTP Port</label><input className="input-field" type="number" placeholder="587" value={config.smtp_port || 587} onChange={e => update('smtp_port', parseInt(e.target.value))} /></div>
              <div><label className="label">Username / Email</label><input className="input-field" value={config.smtp_user || ''} onChange={e => update('smtp_user', e.target.value)} /></div>
              <div><label className="label">Password</label><input className="input-field" type="password" placeholder="App password" onChange={e => update('smtp_pass', e.target.value)} /></div>
              <div><label className="label">From Name</label><input className="input-field" placeholder="Your Company" value={config.smtp_from_name || ''} onChange={e => update('smtp_from_name', e.target.value)} /></div>
              <div><label className="label">From Email</label><input className="input-field" placeholder="quotes@company.com" value={config.smtp_from_email || ''} onChange={e => update('smtp_from_email', e.target.value)} /></div>
            </div>
          </div>

          {/* Email Templates */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Message Templates</h2>
            <p className="text-xs text-gray-400">Variables: {'{{contact_name}} {{quote_number}} {{property_name}} {{check_in}} {{check_out}} {{total}} {{currency}} {{valid_until}} {{company_name}}'}</p>
            <div><label className="label">Email Subject</label><input className="input-field" value={config.email_quote_subject || ''} onChange={e => update('email_quote_subject', e.target.value)} /></div>
            <div><label className="label">Email Body</label><textarea className="input-field font-mono text-xs" rows="6" value={config.email_quote_body || ''} onChange={e => update('email_quote_body', e.target.value)} /></div>
            <div><label className="label">WhatsApp Quote Message</label><textarea className="input-field font-mono text-xs" rows="3" value={config.whatsapp_quote_template || ''} onChange={e => update('whatsapp_quote_template', e.target.value)} /></div>
            <div><label className="label">WhatsApp Reminder Message</label><textarea className="input-field font-mono text-xs" rows="3" value={config.whatsapp_reminder_template || ''} onChange={e => update('whatsapp_reminder_template', e.target.value)} /></div>
          </div>
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Team Members</h2>
              <p className="text-sm text-gray-500">Representatives that can be assigned to clients.</p>
            </div>
            <button onClick={() => setShowTeamModal(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus size={14} /> Add Member</button>
          </div>

          {teamMembers.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">No team members yet.</div>
          ) : (
            <div className="space-y-3">
              {teamMembers.map(t => (
                <div key={t.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold text-sm">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.email} {t.phone && `· ${t.phone}`}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${t.role === 'admin' ? 'bg-purple-100 text-purple-700' : t.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{t.role}</span>
                  <button onClick={() => handleDeleteTeam(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}

          {showTeamModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-md w-full">
                <div className="p-5 border-b flex items-center justify-between">
                  <h2 className="font-semibold">Add Team Member</h2>
                  <button onClick={() => setShowTeamModal(false)}><X size={20} className="text-gray-400" /></button>
                </div>
                <form onSubmit={handleAddTeam} className="p-5 space-y-4">
                  <div><label className="label">Name *</label><input className="input-field" required value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} /></div>
                  <div><label className="label">Email</label><input className="input-field" type="email" value={teamForm.email} onChange={e => setTeamForm({...teamForm, email: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">Phone</label><input className="input-field" value={teamForm.phone} onChange={e => setTeamForm({...teamForm, phone: e.target.value})} /></div>
                    <div><label className="label">Role</label><select className="input-field" value={teamForm.role} onChange={e => setTeamForm({...teamForm, role: e.target.value})}><option value="representative">Representative</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
                  </div>
                  <div className="flex gap-3"><button type="submit" className="btn-primary flex-1">Add</button><button type="button" onClick={() => setShowTeamModal(false)} className="btn-secondary">Cancel</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api' && (
        <div className="card p-6 space-y-6">
          <h2 className="font-semibold text-gray-900">API Integrations</h2>
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-sm text-blue-900 mb-3">Hostaway</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Account ID</label><input className="input-field" value={config.hostaway_account_id || ''} onChange={e => update('hostaway_account_id', e.target.value)} /></div>
              <div><label className="label">API Key</label><input className="input-field" type="password" placeholder={config.hostaway_api_key_masked || 'Enter key'} onChange={e => update('hostaway_api_key', e.target.value)} />{config.hostaway_api_key_masked && <p className="text-xs text-gray-400 mt-1">Current: {config.hostaway_api_key_masked}</p>}</div>
            </div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h3 className="font-medium text-sm text-green-900 mb-3">WhatsApp (Meta Business API)</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Phone Number ID</label><input className="input-field" value={config.whatsapp_phone_number || ''} onChange={e => update('whatsapp_phone_number', e.target.value)} /></div>
              <div><label className="label">Access Token</label><input className="input-field" type="password" placeholder={config.whatsapp_api_key_masked || 'Enter token'} onChange={e => update('whatsapp_api_key', e.target.value)} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
