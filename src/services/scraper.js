/* ============================================================
   /src/services/scraper.js
   ------------------------------------------------------------
   Responsibilities:
   - Fetch raw HTML for a given article link
   - Extract main article text using known selectors
   - Fallback: collect <p> tags if selectors fail
   - Remove boilerplate (ads, share prompts, © notices)
   - Extract representative image (pref. og:image / twitter:image)
   - Return { content, image } for summarization + storage
   ============================================================ */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

/* ---------- Helpers ---------- */
// Resolve a relative image URL against page URL
function resolveImage(src, pageUrl) {
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return src || '';
  }
}

/* ---------- Core Scraper ---------- */
async function extractContentFromLink(url) {
  try {
    // Fetch HTML with safe headers and sane timeouts
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000,                 // fail after 10s
      maxRedirects: 5,                // avoid endless loops
      validateStatus: s => s >= 200 && s < 400 // accept 2xx/3xx only
    });

    const $ = cheerio.load(data);

    /* ---------- Step 1: Known Article Containers ---------- */
    let articleText = '';
    const knownSelectors = [
      '.article__content',
      '.article-body',
      '.Normal',
      'div#content',
      'article',
      '.story-content',
      '.post-content',
      '.entry-content',
      '#storyBody'
    ];

    for (const selector of knownSelectors) {
      if ($(selector).length) {
        articleText = $(selector).text().trim();
        if (articleText.length > 200) break; // stop if substantial
      }
    }

    /* ---------- Step 2: Fallback to <p> tags ---------- */
    if (!articleText || articleText.length < 200) {
      articleText = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(p => p.length > 50) // skip short boilerplate lines
        .join(' ');
    }

    /* ---------- Step 3: Boilerplate Cleanup ---------- */
    const boilerplatePatterns = [
      /share this article/gi,
      /advertisement/gi,
      /©\s?\d{4}/gi
    ];
    boilerplatePatterns.forEach(pattern => {
      articleText = articleText.replace(pattern, '');
    });

    articleText = articleText.replace(/\s+/g, ' ').trim();

    /* ---------- Step 4: Extract Representative Image ---------- */
    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('img').first().attr('src') ||
      '';

    image = resolveImage(image, url);

    return { content: articleText, image };
  } catch (err) {
    console.error(`❌ Failed to scrape ${url}:`, err.message);
    return { content: '', image: '' };
  }
}

/* ---------- Exports ---------- */
module.exports = extractContentFromLink;
