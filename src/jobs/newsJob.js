/* ============================================================
   /src/jobs/newsJob.js
   ------------------------------------------------------------
   Responsibilities:
   - Fetch articles from RSS feeds
   - Scrape full content + image from article links
   - Summarize content using LLM
   - Save clean articles to MongoDB
   - Handle duplicates, short content, and errors gracefully
   ============================================================ */

const fetchRSSArticles = require('../services/rssFetcher');
const extractContentFromLink = require('../services/scraper');
const summarizeContent = require('../services/summarizer');
const Article = require('../models/article');

/* ---------- Tunables ---------- */
const MIN_CONTENT_LEN = 200;   // scraped content must be at least this long
const CONCURRENCY     = 5;     // how many articles to process in parallel

/* ---------- Helper: Process with Concurrency ---------- */
// processes a list of items with a concurrency cap
async function processWithConcurrency(items, worker, concurrency = 5) {
  const queue = [...items];
  let active = 0;
  const results = [];

  return new Promise((resolve) => {
    const next = () => {
      if (queue.length === 0 && active === 0) return resolve(results);
      while (active < concurrency && queue.length) {
        const item = queue.shift();
        active++;
        Promise.resolve()
          .then(() => worker(item))
          .then((r) => results.push(r))
          .catch((e) => results.push(Promise.reject(e)))
          .finally(() => {
            active--;
            next();
          });
      }
    };
    next();
  });
}

/* ---------- Helper: Extract Source Name ---------- */
function sourceFromURL(u = '') {
  try {
    const host = new URL(u).hostname.replace(/^www\./i, '');
    const name = host.split('.')[0].replace(/[-_]+/g, ' ');
    return name.replace(/\b\w/g, (m) => m.toUpperCase());
  } catch {
    return 'Unknown';
  }
}

/* ---------- Handle One Article ---------- */
async function handleOneArticle(article) {
  const t0 = Date.now();
  try {
    // basic guards
    if (!article?.link || !article?.title) return { skipped: 'missing_fields' };

    // check duplicate (fast path)
    const existing = await Article.findOne({ link: article.link }).select('_id').lean();
    if (existing) return { skipped: 'duplicate' };

    // scrape
    const { content, image } = await extractContentFromLink(article.link);
    if (!content || content.length < MIN_CONTENT_LEN) return { skipped: 'short_content' };

    // summarize
    const summary = await summarizeContent(content);
    if (!summary || summary.length < 10) return { skipped: 'bad_summary' };

    // source fallback
    const source = article.source || sourceFromURL(article.link);

    // persist
    try {
      await Article.create({
        title: article.title,
        summary,
        link: article.link,
        source,
        pubDate: article.pubDate || null,
        image: image || ''
      });
    } catch (e) {
      if (e && e.code === 11000) return { skipped: 'duplicate_race' }; // race condition duplicate
      throw e;
    }

    console.log(`Saved: "${article.title}" in ${Math.round(Date.now() - t0)}ms`);
    return { saved: true };
  } catch (err) {
    console.error(`Error processing "${article?.title || article?.link}": ${err.message}`);
    return { error: true };
  }
}

/* ---------- Main Job: Fetch + Store News ---------- */
/**
 * Run the pipeline once.
 * @param {'initial'|'recurring'} mode - controls how many items to sample per feed.
 *   - 'initial'  → random 10 from latest 100 per feed (first fill)
 *   - 'recurring'→ random 3–4 from latest 50 per feed (ongoing)
 */
async function fetchAndStoreNews(mode = 'recurring') {
  // fetch list of candidate articles according to mode
  const articles = await fetchRSSArticles(mode);
  if (!Array.isArray(articles) || articles.length === 0) {
    console.warn('No articles fetched from RSS.');
    return;
  }

  // process with a small concurrency cap
  const results = await processWithConcurrency(articles, handleOneArticle, CONCURRENCY);

  // quick summary
  const stats = results.reduce(
    (acc, r) => {
      if (r?.saved) acc.saved++;
      else if (r?.skipped) acc.skipped[r.skipped] = (acc.skipped[r.skipped] || 0) + 1;
      else if (r?.error) acc.errors++;
      return acc;
    },
    { saved: 0, errors: 0, skipped: {} }
  );

  console.log(
    `Job done (${mode}): saved=${stats.saved}, errors=${stats.errors}, skipped=${JSON.stringify(stats.skipped)}`
  );
}

/* ---------- Exports ---------- */
module.exports = fetchAndStoreNews;
