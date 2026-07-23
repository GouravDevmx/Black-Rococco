import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Search, Download, Copy, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
};

export default function QuotesList() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { loadQuotes(); }, [filter]);

  async function loadQuotes() {
    try {
      const params = {};
      if (filter) params.status = filter;
      if (search) params.search = search;
      const res = await api.getQuotes(params);
      setQuotes(res.data || []);
    } catch (err) { toast.error('Failed to load quotes'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const t = setTimeout(loadQuotes, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleDownloadPDF(quoteId, quoteNumber) {
    try {
      toast.loading('Generating PDF...');
      const response = await api.generatePDF(quoteId);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Quote-${quoteNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success('PDF downloaded');
    } catch (err) {
      toast.dismiss();
      toast.error(err.message || 'PDF generation failed');
    }
  }

  async function handleDuplicate(quoteId) {
    try {
      await api.duplicateQuote(quoteId);
      toast.success('Quote duplicated');
      loadQuotes();
    } catch (err) { toast.error(err.message); }
  }

  async function handleStatusChange(quoteId, status) {
    try {
      await api.updateQuote(quoteId, { status });
      toast.success(`Status updated to ${status}`);
      loadQuotes();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <Link to="/quotes/new" className="btn-primary flex items-center gap-2"><Plus size={16} /> New Quote</Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by quote number..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', 'draft', 'sent', 'accepted', 'declined', 'expired'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center text-gray-400 py-12">Loading...</div> : quotes.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No quotes found</h3>
          <Link to="/quotes/new" className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> Create Quote</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200"><tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Quote #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Property</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Dates</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-brand-600">{q.quote_number}</td>
                    <td className="px-4 py-3 text-gray-700">{q.clients?.company_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{q.properties?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(q.check_in).toLocaleDateString()} → {new Date(q.check_out).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={q.status}
                        onChange={e => handleStatusChange(q.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${statusColors[q.status] || 'bg-gray-100'}`}
                      >
                        {['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">${parseFloat(q.total || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleDownloadPDF(q.id, q.quote_number)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-brand-600" title="Download PDF">
                          <Download size={15} />
                        </button>
                        <button onClick={() => handleDuplicate(q.id)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-brand-600" title="Duplicate">
                          <Copy size={15} />
                        </button>
                        <Link to={`/quotes/${q.id}/edit`} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-brand-600" title="View/Edit">
                          <Eye size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
