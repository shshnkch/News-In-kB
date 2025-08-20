// src/routes/pageRoute.js
const express = require('express');
const Article = require('../models/article');
const router = express.Router();

const INITIAL_LIMIT = 10; // how many articles to load on first page

router.get('/', async (req, res) => {
  try {
    const articles = await Article.find({})
      .sort({ createdAt: -1 }) // newest first
      .limit(INITIAL_LIMIT)
      .select('title summary link source pubDate image createdAt') // only needed fields
      .lean(); // faster, returns plain JS objects

    // Small cache header (optional) to reduce server load for repeated hits
    res.set('Cache-Control', 'public, max-age=30'); // 30 seconds

    res.render('index', { articles, page: 1 });
  } catch (err) {
    console.error('Error loading homepage:', err.message);
    res.status(500).send('Error loading homepage.');
  }
});

module.exports = router;

