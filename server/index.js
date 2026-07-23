require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true
    : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// API Routes — guard against missing Supabase config
const supabase = require('./services/supabase');
app.use('/api', (req, res, next) => {
  if (!supabase && req.path !== '/health') {
    return res.status(503).json({
      error: 'Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables in Railway.',
    });
  }
  next();
});

app.use('/api/hostaway', require('./routes/hostaway'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/discounts', require('./routes/discounts'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/config', require('./routes/config'));
app.use('/api/team', require('./routes/team'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Notification processor — runs every 5 minutes
const NotificationService = require('./services/notifications');
setInterval(async () => {
  try {
    await NotificationService.processPendingNotifications();
  } catch (e) {
    console.error('Notification cron error:', e.message);
  }
}, 5 * 60 * 1000);

// Manual trigger endpoint
app.post('/api/notifications/process', async (req, res) => {
  try {
    await NotificationService.processPendingNotifications();
    res.json({ success: true, message: 'Notifications processed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notifications — list scheduled notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('scheduled_notifications')
      .select('*, quotes(quote_number), contacts(first_name, last_name, email)')
      .order('scheduled_for', { ascending: true });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend — always try (not just in production)
const fs = require('fs');
const clientDistPath = path.join(__dirname, '../client/dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');

if (fs.existsSync(clientDistPath)) {
  console.log('✅ Frontend build found at', clientDistPath);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(clientIndexPath);
  });
} else {
  console.log('⚠️  No frontend build at', clientDistPath);
  app.get('*', (req, res) => {
    res.status(200).send(`
      <html>
        <head><title>Property CRM</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f7fafc;">
          <div style="text-align:center;max-width:500px;padding:40px;">
            <h1 style="color:#1e3a5f;">🏠 Property CRM</h1>
            <p style="color:#666;">API is running but the frontend hasn't been built yet.</p>
            <p style="color:#999;font-size:14px;">The API is healthy at <a href="/api/health">/api/health</a></p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0;">
            <p style="color:#999;font-size:13px;">Run <code style="background:#edf2f7;padding:2px 6px;border-radius:4px;">npm run build</code> to build the frontend, or check your Railway build logs.</p>
          </div>
        </body>
      </html>
    `);
  });
}

app.listen(PORT, () => {
  console.log(`🏠 Property CRM server running on port ${PORT}`);
});
