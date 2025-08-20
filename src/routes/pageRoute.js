/* ============================================================
   /src/routes/pageRoute.js
   ------------------------------------------------------------
   Responsibilities:
   - Server-render the initial page with a small batch of articles
   - Keep it fast (lean queries + light projection)
   - Stay consistent with /news sorting so items don’t “jump”
   ============================================================ */

const express = require('express');
const Article = require('../models/article');
const router = express.Router();

/* How many articles to send with the initial SSR render.
   FE will take over and paginate via /news afterwards. */
const INITIAL_LIMIT = 10;

router.get('/', async (req, res) => {
  try {
    const articles = await Article.find({})
      // Stable newest-first ordering to match /news:
      // pubDate desc → createdAt desc → _id desc
      .sort({ pubDate: -1, createdAt: -1, _id: -1 })
      .limit(INITIAL_LIMIT)
      .select('title summary link source pubDate image createdAt') // keep payload lean
      .lean(); // faster plain JS objects

    // Small cache to ease repeated hits (tune as you like)
    res.set('Cache-Control', 'public, max-age=30');

    // Render the initial view; FE will fetch more via /news
    res.render('index', { articles, page: 1 });
  } catch (err) {
    console.error('Error loading homepage:', err.message);
    res.status(500).send('Error loading homepage.');
  }
});

module.exports = router;
