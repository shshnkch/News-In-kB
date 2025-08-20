/* ============================================================
   /src/routes/newsRoute.js  (snapshot-safe pagination)
   ------------------------------------------------------------
   Responsibilities:
   - Serve paginated news in a stable order
   - Issue a "snapshot" (ISO datetime) on page 1
   - Constrain pages 2..N to createdAt <= snapshot to avoid drift
   - Keep FE default page size in sync (50)
   ============================================================ */

const express = require('express');
const Article = require('../models/article');

const router = express.Router();

/* ---------- Paging caps ---------- */
const MAX_LIMIT = 100;     // hard cap
const DEFAULT_LIMIT = 50;  // FE expects 50

/* ---------- Helpers ---------- */
// parse numeric query param safely (supports arrays)
function parseIntParam(val, fallback) {
  if (Array.isArray(val)) val = val[0];
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

router.get('/news', async (req, res) => {
  try {
    // -------- parse & sanitize --------
    const limit = Math.min(
      Math.max(parseIntParam(req.query.limit, DEFAULT_LIMIT), 1),
      MAX_LIMIT
    );
    const page = Math.max(parseIntParam(req.query.page, 1), 1);
    const skip = (page - 1) * limit;

    // stable newest-first ordering (prevents shuffling)
    const sortBy =
      req.query.sortBy === 'pubDate'
        ? { pubDate: -1, createdAt: -1, _id: -1 }
        : { createdAt: -1, pubDate: -1, _id: -1 };

    // -------- snapshot handling --------
    // page 1: create fresh snapshot = "now"
    // page 2..N: reuse client's snapshot to freeze the dataset
    const snapParam = Array.isArray(req.query.snapshot) ? req.query.snapshot[0] : req.query.snapshot;
    let snapshot = snapParam ? new Date(snapParam) : null;
    if (!snapshot || Number.isNaN(snapshot.getTime())) {
      snapshot = new Date(); // anchor at first request
    }

    const baseQuery = { createdAt: { $lte: snapshot } };

    // -------- query --------
    const [total, articles] = await Promise.all([
      Article.countDocuments(baseQuery),
      Article.find(baseQuery)
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .select('title summary link source pubDate image createdAt')
        .lean()
    ]);

    res.status(200).json({
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalArticles: total,
      snapshot: snapshot.toISOString(), // client reuses this for pages 2..N
      count: articles.length,
      articles
    });
  } catch (err) {
    console.error('Error generating news feed:', err.message);
    res.status(500).json({ error: 'Failed to generate news' });
  }
});

module.exports = router;
