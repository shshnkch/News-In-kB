// src/routes/newsRoute.js
const express = require('express');
const Article = require('../models/article');

const router = express.Router();

// caps to protect DB
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

router.get('/news', async (req, res) => {
  try {
    // ---- parse & sanitize query ----
    const pageRaw  = Number(req.query.page);
    const limitRaw = Number(req.query.limit);

    const page  = Number.isInteger(pageRaw)  && pageRaw  > 0 ? pageRaw  : 1;
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;
    const skip  = (page - 1) * limit;

    // optional: allow sorting by pubDate (fallback to createdAt)
    const sortBy = (req.query.sortBy === 'pubDate') ? { pubDate: -1 } : { createdAt: -1 };

    // ---- query ----
    const [articles, total] = await Promise.all([
      Article.find({})
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .select('title summary link source pubDate image createdAt') // projection for smaller payload
        .lean(),                                                     // faster, plain objects
      Article.countDocuments()
    ]);

    res.status(200).json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
