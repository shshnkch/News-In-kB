// server.js
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

const pageRoute = require('./src/routes/pageRoute');
const newsRoute = require('./src/routes/newsRoute');
const fetchAndStoreNews = require('./src/jobs/newsJob');

dotenv.config();

/* ------------ env & config ------------ */
const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const NEWS_INTERVAL_MIN = Math.max(5, Number(process.env.NEWS_INTERVAL_MIN || 60)); // min 5 min

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

/* ------------ express app ------------ */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

// Static files (+ mild caching for assets)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // cache only hashed/static assets if you add them later; for now small cache
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Basic health & readiness
app.get('/healthz', (req, res) => {
  const up = mongoose.connection.readyState === 1 ? 'ok' : 'degraded';
  res.status(200).json({ status: 'up', db: up, time: new Date().toISOString() });
});

/* ------------ routes ------------ */
app.use('/', pageRoute);
app.use('/', newsRoute);

// Centralized error handler (last)
app.use((err, _req, res, _next) => {
  console.error('Unhandled route error:', err?.message || err);
  res.status(500).json({ error: 'Internal Server Error' });
});

/* ------------ job scheduling ------------ */
let jobTimer = null;
function scheduleJob() {
  clearInterval(jobTimer);
  jobTimer = setInterval(fetchAndStoreNews, NEWS_INTERVAL_MIN * 60 * 1000);
}

// Run an initial job safely (after DB ready) then schedule
async function startJobs() {
  try {
    await fetchAndStoreNews();
  } catch (e) {
    console.error('Initial news job failed:', e?.message || e);
  }
  scheduleJob();
}

/* ------------ DB & server start ------------ */
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // start HTTP server only after DB is ready
    const server = app.listen(PORT, () => {
      console.log(`Server listening on ${PORT}`);
    });

    // start background jobs
    startJobs();

    // graceful shutdown
    const shutdown = async (sig) => {
      console.log(`\n${sig} received. Shutting down...`);
      clearInterval(jobTimer);
      server.close(async () => {
        try { await mongoose.connection.close(); } catch {}
        process.exit(0);
      });
      // hard-exit fallback
      setTimeout(() => process.exit(1), 8000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err?.message || err);
    process.exit(1);
  });

// catch unexpected issues
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r));
process.on('uncaughtException', (e) => {
  console.error('uncaughtException:', e);
  // don’t exit abruptly in dev; in prod consider exiting to restart cleanly
});
