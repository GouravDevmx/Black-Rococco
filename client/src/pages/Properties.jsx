import React, { useState, useEffect } from 'react';
import { Building2, RefreshCw, Search, MapPin, Users, BedDouble, Bath } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { loadProperties(); }, []);

  async function loadProperties() {
    try {
      const res = await api.getProperties(search ? { search } : {});
      setProperties(res.data || []);
    } catch (err) {
      toast.error('Failed to load properties');
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api.syncProperties();
      toast.success(res.message || `Synced ${res.synced} properties`);
      loadProperties();
    } catch (err) {
      toast.error(err.message || 'Sync failed. Check Hostaway settings.');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadProperties(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
        <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync from Hostaway'}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading properties...</div>
      ) : properties.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No properties found</h3>
          <p className="text-sm text-gray-400 mb-4">Sync your listings from Hostaway or add one manually.</p>
          <button onClick={handleSync} className="btn-primary">Sync from Hostaway</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map(p => (
            <div key={p.id} className="card overflow-hidden hover:shadow-md transition-shadow">
              {/* Thumbnail */}
              <div className="h-40 bg-gray-100 relative">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Building2 size={40} className="text-gray-300" />
                  </div>
                )}
                {!p.is_active && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded">Inactive</div>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{p.name}</h3>
                {(p.city || p.address) && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                    <MapPin size={12} />
                    {[p.city, p.state, p.country].filter(Boolean).join(', ')}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1"><BedDouble size={13} /> {p.bedrooms}</span>
                  <span className="flex items-center gap-1"><Bath size={13} /> {p.bathrooms}</span>
                  <span className="flex items-center gap-1"><Users size={13} /> {p.max_guests}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold text-brand-700">{p.currency} {parseFloat(p.base_price).toFixed(0)}</span>
                    <span className="text-xs text-gray-400"> /night</span>
                  </div>
                  {p.cleaning_fee > 0 && (
                    <span className="text-xs text-gray-400">+{p.currency} {parseFloat(p.cleaning_fee).toFixed(0)} cleaning</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
