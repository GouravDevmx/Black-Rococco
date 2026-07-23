import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Home, Building2, Users, FileText, Tags, Bell, Settings, Menu, X, ChevronRight } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import QuotesList from './pages/QuotesList';
import QuoteBuilder from './pages/QuoteBuilder';
import Discounts from './pages/Discounts';
import Reminders from './pages/Reminders';
import SettingsPage from './pages/Settings';

const navItems = [
  { to: '/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/properties', icon: Building2, label: 'Properties' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/quotes', icon: FileText, label: 'Quotes' },
  { to: '/discounts', icon: Tags, label: 'Discounts' },
  { to: '/reminders', icon: Bell, label: 'Reminders' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      <Toaster position="top-right" />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-brand-950 text-white transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex flex-col`}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center text-lg font-bold">P</div>
            <div>
              <div className="font-semibold text-sm">Property CRM</div>
              <div className="text-[11px] text-brand-300">Quote & Manage</div>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white font-medium'
                    : 'text-brand-200 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-[11px] text-brand-400 text-center">v1.0 MVP</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 shrink-0">
          <button className="lg:hidden p-1" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} className="text-gray-600" />
          </button>
          <div className="flex-1" />
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/quotes" element={<QuotesList />} />
            <Route path="/quotes/new" element={<QuoteBuilder />} />
            <Route path="/quotes/:id/edit" element={<QuoteBuilder />} />
            <Route path="/discounts" element={<Discounts />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
