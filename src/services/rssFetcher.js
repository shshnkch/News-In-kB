/* ============================================================
   /src/services/rssFetcher.js
   ------------------------------------------------------------
   Responsibilities:
   - Parse multiple RSS/Atom feeds using rss-parser
   - Normalize fields (title, link, pubDate, source)
   - Initial run: pick random 10 from latest 100 per feed
   - Recurring run: pick 3–4 random from latest 50 per feed
   - Deduplicate across feeds
   - Sort newest-first for downstream jobs
   ============================================================ */

const Parser = require('rss-parser');
const dotenv = require('dotenv');

dotenv.config();

/* ---------- Tunables ---------- */
const INITIAL_LIMIT = 100;  // look at latest 100 items on first run
const INITIAL_PICK  = 10;   // pick 10 random from those
const RECUR_LIMIT   = 50;   // look at latest 50 items on recurring runs
const RECUR_PICK    = 4;    // picking 4(As of now) random news

/* ---------- Source Map ---------- */
const SOURCE_MAP = {
  'https://feeds.feedburner.com/ndtvnews-top-stories': 'NDTV',
  'https://www.thehindu.com/news/national/feeder/default.rss': 'The Hindu',
  'https://news.abplive.com/home/feed': 'ABP News',
  'https://www.indiatoday.in/rss/home': 'India Today',
  'https://zeenews.india.com/rss/india-national-news.xml': 'Zee News',
  'https://www.news18.com/rss/india.xml': 'News18'
};

/* ---------- Helpers ---------- */
function siteFromURL(feedURL) {
  try {
    const { hostname } = new URL(feedURL);
    const host = hostname.replace(/^www\./i, '').split('.')[0];
    return host
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  } catch {
    return feedURL;
  }
}

function pickLink(item) {
  if (typeof item.link === 'string') return item.link;
  if (item.guid && typeof item.guid === 'string') return item.guid;
  if (Array.isArray(item.link) && item.link.length) {
    const alt = item.link.find(l => l.rel === 'alternate' && l.href);
    if (alt?.href) return alt.href;
    if (item.link[0]?.href) return item.link[0].href;
  }
  return '';
}

function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Pick N random items from an array
function pickRandomItems(arr, count) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const shuffled = arr.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/* ---------- Parser ---------- */
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/rss+xml,application/xml'
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

/* ---------- Feed List ---------- */
const rssFeeds =
  process.env.RSS_URL_TOP_STORIES?.split(',')
    .map(s => s.trim())
    .filter(Boolean) || [];

/* ---------- Normalization ---------- */
function normalizeItem(item, url) {
  const source = SOURCE_MAP[url] || siteFromURL(url);
  return {
    title: item.title || '',
    link: pickLink(item),
    pubDate: toDate(item.isoDate || item.pubDate || item.published || item.updated),
    source
  };
}

/* ---------- Fetch One Feed ---------- */
async function fetchOne(url, mode = 'recurring') {
  const feed = await parser.parseURL(url);
  const items = Array.isArray(feed?.items) ? feed.items : [];

  if (mode === 'initial') {
    const latest = items.slice(0, INITIAL_LIMIT);
    const picked = pickRandomItems(latest, INITIAL_PICK);
    return picked.map(item => normalizeItem(item, url));
  } else {
    const latest = items.slice(0, RECUR_LIMIT);
    const howMany = Math.floor(Math.random() * 2) + (RECUR_PICK - 1); // 3–4
    const picked = pickRandomItems(latest, howMany);
    return picked.map(item => normalizeItem(item, url));
  }
}

/* ---------- Fetch All Feeds ---------- */
async function fetchRSSArticles(mode = 'recurring') {
  const allArticles = [];

  for (const url of rssFeeds) {
    try {
      const articles = await fetchOne(url, mode);
      allArticles.push(...articles);
    } catch (err) {
      console.error(`Unable to fetch from ${url}: ${err.message}`);
    }
  }

  // Deduplicate
  const seen = new Set();
  const deduped = [];
  for (const a of allArticles) {
    const key = a.link || `${a.title}::${a.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  // Sort newest first
  deduped.sort((a, b) => {
    const da = a.pubDate ? a.pubDate.getTime() : -Infinity;
    const db = b.pubDate ? b.pubDate.getTime() : -Infinity;
    return db - da;
  });

  return deduped;
}

/* ---------- Exports ---------- */
module.exports = fetchRSSArticles;
