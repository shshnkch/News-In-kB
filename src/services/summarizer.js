/* ============================================================
   /src/services/summarizer.js
   ------------------------------------------------------------
   Responsibilities:
   - Summarize scraped news content into ~100 words
   - Rotate across multiple LLM models on failures / rate limits
   - Clean responses to strip “Summary:” style lead-ins
   - Fail gracefully (never throw), always return a string
   ============================================================ */

const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

/* ---------- Model List ---------- */
// Build list from env (MODEL_LIST), else fallback
const MODELS = (process.env.MODEL_LIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!MODELS.length) MODELS.push('llama-3.1-8b-instant');

/* ---------- Client ---------- */
// Groq exposes OpenAI-compatible API surface
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Strip “Summary:” / “Here’s the summary:” etc.
function clean(text = '') {
  return text
    .replace(/^\s*(here'?s|this is)\s+(the\s+)?summary[:\-]\s*/i, '')
    .replace(/^\s*summary[:\-]\s*/i, '')
    .trim();
}

// Check if error is a rate-limit / quota issue
function isRateLimit(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('tpm');
}

// Check if error is retryable (timeouts, 5xx, overload)
function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return (
    isRateLimit(err) ||
    (status >= 500 && status < 600) ||
    msg.includes('timeout') ||
    msg.includes('temporar') || // temporary/unavailable
    msg.includes('overload')
  );
}

/* ---------- Single Call ---------- */
// Make one LLM call with strict summarization prompt
async function callOnce(model, text) {
  const prompt = `Summarize the news below in under 100 words. Return only the summary—no preface, no bullets, no title.

${text}`;

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'Write a tight, neutral, single-paragraph news summary. No lead-ins.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
  });

  return clean(res.choices?.[0]?.message?.content || '');
}

/* ---------- Main Summarizer ---------- */
// Rotate models on failures, retry transient errors with backoff
async function summarizeContent(text) {
  if (!text || text.length < 40) return '';

  let idx = 0;
  let lastErr;

  for (let turns = 0; turns < MODELS.length * 2; turns++) {
    const model = MODELS[idx];
    try {
      const out = await callOnce(model, text);
      if (out) return out;

      // empty response → hop to next
      idx = (idx + 1) % MODELS.length;
    } catch (err) {
      lastErr = err;

      if (isRateLimit(err)) {
        idx = (idx + 1) % MODELS.length;
        continue;
      }
      if (isRetryable(err)) {
        await sleep(400);
        idx = (idx + 1) % MODELS.length;
        continue;
      }

      // non-retryable
      break;
    }
  }

  console.error('summarize failed after rotations:', lastErr?.message || lastErr);
  return '';
}

/* ---------- Exports ---------- */
module.exports = summarizeContent;
