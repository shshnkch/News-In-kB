/* ============================================================
   /src/jobs/scheduler.js
   ------------------------------------------------------------
   What this does:
   - Connects to MongoDB
   - Runs an "initial" fill once (only if DB is basically empty)
   - Then runs the news job on a fixed schedule (recurring)
   - Keeps process alive on Railway as a Worker service
   ============================================================ */

require('dotenv').config();

const mongoose = require('mongoose');
const cron = require('node-cron');
const fetchAndStoreNews = require('./newsJob');
const Article = require('../models/article');

/* ---------- Tunables ---------- */
// default: every 30 minutes (use "*/60 * * * *" for hourly)
const CRON_EXPR = process.env.NEWS_CRON || '*/30 * * * *';

// threshold to decide if we should run the "initial" mode on boot
// if your DB has less than this many articles, we'll do an initial fill
const INITIAL_THRESHOLD = Number(process.env.INITIAL_THRESHOLD || 10);

// Optional: cap concurrent Mongoose connections from multiple restarts
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB  = process.env.MONGO_DB || undefined;

/* ---------- Startup ---------- */
(async function boot() {
  try {
    if (!MONGO_URI) {
      console.error('[scheduler] Missing MONGO_URI env var. Exiting.');
      process.exit(1);
    }

    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
    console.log('[scheduler] Mongo connected');

    // Decide if we should run "initial" or not
    let count = 0;
    try {
      count = await Article.estimatedDocumentCount();
    } catch (e) {
      console.warn('[scheduler] Could not get article count:', e?.message || e);
    }

    if (count < INITIAL_THRESHOLD) {
      console.log(`[scheduler] DB has ${count} docs (< ${INITIAL_THRESHOLD}) → running initial fill…`);
      try {
        await fetchAndStoreNews('initial');
      } catch (e) {
        console.error('[scheduler] initial run failed:', e?.message || e);
      }
    } else {
      console.log(`[scheduler] DB has ${count} docs → skipping initial fill`);
    }

    // Schedule recurring runs
    if (!cron.validate(CRON_EXPR)) {
      console.error(`[scheduler] Invalid CRON expression "${CRON_EXPR}". Use NEWS_CRON env to set a valid one.`);
      process.exit(1);
    }

    cron.schedule(CRON_EXPR, async () => {
      try {
        console.log('[scheduler] recurring run…');
        await fetchAndStoreNews('recurring');
      } catch (e) {
        console.error('[scheduler] recurring run failed:', e?.message || e);
      }
    });

    console.log(`[scheduler] up and scheduling with CRON="${CRON_EXPR}"`);

    // keep process alive (cron does this anyway, but guards are nice)
  } catch (err) {
    console.error('[scheduler] fatal boot error:', err?.message || err);
    process.exit(1);
  }
})();

/* ---------- Graceful shutdown ---------- */
async function shutdown(signal) {
  try {
    console.log(`[scheduler] ${signal} received → closing Mongo connection…`);
    await mongoose.connection.close();
  } catch (e) {
    console.warn('[scheduler] error during shutdown:', e?.message || e);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
