const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

export const api = {
  // Config
  getConfig: () => request('/config'),
  updateConfig: (data) => request('/config', { method: 'PUT', body: data }),
  getDashboardStats: () => request('/config/dashboard-stats'),

  // Hostaway
  syncProperties: () => request('/hostaway/sync', { method: 'POST' }),
  getHostawayPricing: (hostawayId, startDate, endDate) =>
    request(`/hostaway/pricing/${hostawayId}?startDate=${startDate}&endDate=${endDate}`),

  // Properties
  getProperties: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/properties${qs ? '?' + qs : ''}`);
  },
  getProperty: (id) => request(`/properties/${id}`),
  updateProperty: (id, data) => request(`/properties/${id}`, { method: 'PUT', body: data }),
  createProperty: (data) => request('/properties', { method: 'POST', body: data }),

  // Clients
  getClients: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/clients${qs ? '?' + qs : ''}`);
  },
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', { method: 'POST', body: data }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: data }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
  createContact: (clientId, data) => request(`/clients/${clientId}/contacts`, { method: 'POST', body: data }),
  updateContact: (clientId, contactId, data) => request(`/clients/${clientId}/contacts/${contactId}`, { method: 'PUT', body: data }),
  deleteContact: (clientId, contactId) => request(`/clients/${clientId}/contacts/${contactId}`, { method: 'DELETE' }),

  // Quotes
  getQuotes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/quotes${qs ? '?' + qs : ''}`);
  },
  getQuote: (id) => request(`/quotes/${id}`),
  createQuote: (data) => request('/quotes', { method: 'POST', body: data }),
  updateQuote: (id, data) => request(`/quotes/${id}`, { method: 'PUT', body: data }),
  duplicateQuote: (id) => request(`/quotes/${id}/duplicate`, { method: 'POST' }),
  generatePDF: (id) => fetch(`${API_BASE}/quotes/${id}/pdf`, { method: 'POST' }),

  // Discounts
  getDiscounts: () => request('/discounts'),
  createDiscount: (data) => request('/discounts', { method: 'POST', body: data }),
  updateDiscount: (id, data) => request(`/discounts/${id}`, { method: 'PUT', body: data }),
  deleteDiscount: (id) => request(`/discounts/${id}`, { method: 'DELETE' }),
  validateDiscount: (data) => request('/discounts/validate', { method: 'POST', body: data }),

  // Reminders
  getReminders: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reminders${qs ? '?' + qs : ''}`);
  },
  createReminder: (data) => request('/reminders', { method: 'POST', body: data }),
  updateReminder: (id, data) => request(`/reminders/${id}`, { method: 'PUT', body: data }),
  deleteReminder: (id) => request(`/reminders/${id}`, { method: 'DELETE' }),

  // Team Members
  getTeamMembers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/team${qs ? '?' + qs : ''}`);
  },
  createTeamMember: (data) => request('/team', { method: 'POST', body: data }),
  updateTeamMember: (id, data) => request(`/team/${id}`, { method: 'PUT', body: data }),
  deleteTeamMember: (id) => request(`/team/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/notifications${qs ? '?' + qs : ''}`);
  },
  processNotifications: () => request('/notifications/process', { method: 'POST' }),
};
