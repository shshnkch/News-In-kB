/* ============================================================
   /src/routes/newsRoute.js
   ------------------------------------------------------------
   Responsibilities:
   - Serve paginated news to the frontend
   - Keep paging predictable & fast
   - Avoid hidden filters: return every stored article
   - Stay in sync with FE defaults (50 per page)
   ============================================================ */

const express = require('express');
const Article = require('../models/article');

const router = express.Router();

/* ---------- Paging caps ---------- */
// FE asks for 50 per page; keep server default aligned.
// Cap at 100 to protect the DB from huge page sizes.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/* ---------- Helpers ---------- */
/**
 * Parse a numeric query param safely.
 * - Accepts string OR array (Express can hand arrays if ?limit appears twice)
 * - Falls back to a given default if missing/invalid
 */
function parseIntParam(val, fallback) {
  if (Array.isArray(val)) val = val[0];
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

/* ---------- Route: GET /news ---------- */
router.get('/news', async (req, res) => {
  try {
    // ---- parse & sanitize query ----
    // Use 50 as default so even if FE forgets ?limit, we still send 50.
    const limit = Math.min(
      Math.max(parseIntParam(req.query.limit, DEFAULT_LIMIT), 1),
      MAX_LIMIT
    );
    const page = Math.max(parseIntParam(req.query.page, 1), 1);
    const skip = (page - 1) * limit;

    // Stable, newest-first ordering.
    // Use a compound sort so pagination doesn't shuffle between requests:
    //   pubDate desc → createdAt desc → _id desc
    // If client asks for sortBy=pubDate, prioritize pubDate; otherwise prefer createdAt.
    const sortBy =
      req.query.sortBy === 'pubDate'
        ? { pubDate: -1, createdAt: -1, _id: -1 }
        : { createdAt: -1, pubDate: -1, _id: -1 };

    // ---- query ----
    // No hidden filters — expose all articles we have.
    const [total, articles] = await Promise.all([
      Article.countDocuments({}), // exact total across the whole collection
      Article.find({})
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .select('title summary link source pubDate image createdAt') // keep payload lean
        .lean()
    ]);

    // ---- payload ----
    res.status(200).json({
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalArticles: total,
      count: articles.length,
      articles
    });
  } catch (err) {
    console.error('Error generating news feed:', err.message);
    res.status(500).json({ error: 'Failed to generate news' });
  }
});

module.exports = router;
