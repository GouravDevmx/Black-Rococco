import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, FileText, Bell, DollarSign, Clock, Plus, ArrowRight, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { api } from '../lib/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ReminderCalendar({ reminders }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Map reminders to dates
  const remindersByDate = {};
  (reminders || []).forEach(r => {
    const d = new Date(r.due_date).toDateString();
    if (!remindersByDate[d]) remindersByDate[d] = [];
    remindersByDate[d].push(r);
  });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Get this week's and today's reminders
  const todayStr = today.toDateString();
  const todaysReminders = remindersByDate[todayStr] || [];

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekReminders = (reminders || []).filter(r => {
    const d = new Date(r.due_date);
    return d >= weekStart && d <= weekEnd;
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={18} className="text-brand-600" /> Reminder Calendar
          </h2>
          <div className="flex gap-1">
            {['month', 'week', 'today'].map(v => (
              <button key={v} onClick={() => { setView(v); if (v === 'today') goToday(); }}
                className={`text-xs px-2.5 py-1 rounded-full ${view === v ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {view === 'month' && (
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={18} /></button>
            <span className="font-medium text-sm">{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={18} /></button>
          </div>
        )}
      </div>

      {view === 'month' && (
        <div className="p-3">
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-[10px] font-medium text-gray-400 text-center py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="h-10" />;
              const dateObj = new Date(year, month, day);
              const dateStr = dateObj.toDateString();
              const isToday = dateStr === today.toDateString();
              const dayReminders = remindersByDate[dateStr] || [];
              const hasReminders = dayReminders.length > 0;
              const hasOverdue = dayReminders.some(r => !r.is_completed && dateObj < today);

              return (
                <div key={day} className={`h-10 flex flex-col items-center justify-center rounded-lg text-xs relative
                  ${isToday ? 'bg-brand-600 text-white font-bold' : 'hover:bg-gray-50'}
                  ${hasOverdue && !isToday ? 'bg-red-50' : ''}`}
                  title={dayReminders.map(r => r.title).join(', ')}
                >
                  {day}
                  {hasReminders && (
                    <div className="flex gap-0.5 mt-0.5">
                      {dayReminders.slice(0, 3).map((r, j) => (
                        <div key={j} className={`w-1.5 h-1.5 rounded-full ${
                          r.is_completed ? 'bg-green-400' :
                          hasOverdue ? 'bg-red-400' :
                          isToday ? 'bg-white' : 'bg-brand-400'
                        }`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(view === 'today' || view === 'week') && (
        <div className="divide-y divide-gray-100">
          {view === 'today' && (
            <>
              <div className="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
                Today — {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              {todaysReminders.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">No reminders today</div>
              ) : todaysReminders.map(r => (
                <ReminderRow key={r.id} reminder={r} />
              ))}
            </>
          )}
          {view === 'week' && (
            <>
              <div className="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
                This Week — {weekStart.toLocaleDateString()} to {weekEnd.toLocaleDateString()}
              </div>
              {weekReminders.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">No reminders this week</div>
              ) : weekReminders.map(r => (
                <ReminderRow key={r.id} reminder={r} showDate />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderRow({ reminder: r, showDate }) {
  const isOverdue = new Date(r.due_date) < new Date() && !r.is_completed;
  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
      <div className={`w-2 h-2 rounded-full shrink-0 ${
        r.is_completed ? 'bg-green-400' : isOverdue ? 'bg-red-400' : 'bg-brand-400'
      }`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${r.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {r.title}
        </div>
        <div className="text-xs text-gray-500">
          {r.clients?.company_name && `${r.clients.company_name} · `}
          {r.reminder_type?.replace('_', ' ')}
        </div>
      </div>
      {showDate && (
        <div className="text-xs text-gray-400">
          {new Date(r.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [allReminders, setAllReminders] = useState([]);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [statsRes, remindersRes, allRemindersRes, quotesRes] = await Promise.all([
        api.getDashboardStats(),
        api.getReminders({ is_completed: 'false', upcoming: 'true' }),
        api.getReminders({ is_completed: 'false' }),
        api.getQuotes({}),
      ]);
      setStats(statsRes.data);
      setReminders(remindersRes.data?.slice(0, 5) || []);
      setAllReminders(allRemindersRes.data || []);
      setRecentQuotes(quotesRes.data?.slice(0, 5) || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: 'Properties', value: stats?.properties || 0, icon: Building2, color: 'bg-blue-500', link: '/properties' },
    { label: 'Clients', value: stats?.clients || 0, icon: Users, color: 'bg-emerald-500', link: '/clients' },
    { label: 'Total Quotes', value: stats?.quotes || 0, icon: FileText, color: 'bg-violet-500', link: '/quotes' },
    { label: 'Pending', value: stats?.pending_quotes || 0, icon: Clock, color: 'bg-amber-500', link: '/quotes' },
    { label: 'Reminders', value: stats?.active_reminders || 0, icon: Bell, color: 'bg-rose-500', link: '/reminders' },
    { label: 'Revenue', value: `$${(stats?.accepted_revenue || 0).toLocaleString()}`, icon: DollarSign, color: 'bg-green-600', link: '/quotes' },
  ];

  const statusColors = {
    draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-purple-100 text-purple-700', accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400">Loading dashboard...</div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link to="/quotes/new" className="btn-primary flex items-center gap-2"><Plus size={16} /> New Quote</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, link }) => (
          <Link key={label} to={link} className="card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center`}>
                <Icon size={18} className="text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-1">
          <ReminderCalendar reminders={allReminders} />
        </div>

        {/* Recent Quotes + Upcoming Reminders */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Quotes */}
          <div className="card">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Quotes</h2>
              <Link to="/quotes" className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1">View all <ArrowRight size={14} /></Link>
            </div>
            <div className="divide-y divide-gray-100">
              {recentQuotes.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No quotes yet.</div>
              ) : recentQuotes.map(q => (
                <div key={q.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{q.quote_number}</div>
                    <div className="text-xs text-gray-500">{q.clients?.company_name || 'No client'} — {q.properties?.name || 'No property'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[q.status] || 'bg-gray-100'}`}>{q.status}</span>
                    <span className="text-sm font-semibold text-gray-900">${parseFloat(q.total || 0).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Reminders */}
          <div className="card">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Upcoming Reminders</h2>
              <Link to="/reminders" className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1">View all <ArrowRight size={14} /></Link>
            </div>
            <div className="divide-y divide-gray-100">
              {reminders.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No upcoming reminders.</div>
              ) : reminders.map(r => (
                <div key={r.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{r.title}</div>
                    <div className="text-xs text-gray-500">
                      {r.clients?.company_name && `${r.clients.company_name} — `}
                      {r.reminder_type?.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(r.due_date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
