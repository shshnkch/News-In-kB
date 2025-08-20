/* ============================================================
   NewsInkB Frontend Script
   ------------------------------------------------------------
   Responsibilities:
   - Fetch + cache articles
   - Track read/unread state
   - Switch scope (unread / all)
   - Navigation (next/prev/end)
   - Keyboard + touch navigation
   - Prefetch next image for smoother transitions
   ============================================================ */

/* ---------- Config / Keys ---------- */
const CACHE_KEY = "news_cache_v1";
const READ_KEY  = "news_read_v1";
const SCOPE_KEY = "news_scope_v1";

const CACHE_TTL = 5 * 60 * 1000;       // cache expires in 5 min
const READ_TTL  = 24 * 60 * 60 * 1000; // read markers expire in 24 hrs
const MAX_PAGES_CAP = 1000;            // safety cap
const PAGE_LIMIT = 50;                 // backend page size

/* ---------- DOM Elements ---------- */
const newsContainer  = document.getElementById("news-container");
const prevBtn        = document.getElementById("prevBtn");
const nextBtn        = document.getElementById("nextBtn");
const latestBtn      = document.getElementById("latestBtn");
const scopeSelect    = document.getElementById("scopeSelect");
const scopeToggleBtn = document.getElementById("scopeToggleBtn");
const prevBtnAlt     = document.getElementById("prevBtnAlt");
const nextBtnAlt     = document.getElementById("nextBtnAlt");

/* ---------- Helpers ---------- */
function escapeHTML(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- Read Tracking ---------- */
function loadReadMap() {
  try { return JSON.parse(localStorage.getItem(READ_KEY)) || {}; }
  catch { return {}; }
}
function saveReadMap(map) {
  localStorage.setItem(READ_KEY, JSON.stringify(map));
}
function pruneReadMap(map = loadReadMap()) {
  const now = Date.now();
  let changed = false;
  for (const [id, ts] of Object.entries(map)) {
    if (!ts || now - ts > READ_TTL) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) saveReadMap(map);
  return map;
}
function markRead(id) {
  if (!id) return;
  const map = pruneReadMap();
  map[id] = Date.now();
  saveReadMap(map);
}

/* ---------- Cache Handling ---------- */
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; }
  catch { return null; }
}
function saveCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}
function isCacheFresh(cache) {
  return cache && Date.now() - cache.updatedAt < CACHE_TTL;
}

/* ---------- Scope Persistence ---------- */
function loadScope() {
  return localStorage.getItem(SCOPE_KEY) || "unread";
}
function saveScope(scope) {
  localStorage.setItem(SCOPE_KEY, scope);
}

/* ---------- Indexing Articles ---------- */
function indexArticles(articles) {
  articles.sort(
    (a, b) => new Date(b.createdAt || b.pubDate) - new Date(a.createdAt || a.pubDate)
  );
  const seen = new Set(), order = [], map = {};
  for (const a of articles) {
    const id = a._id || a.link;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    map[id] = a;
  }
  return { updatedAt: Date.now(), order, map };
}

/* ---------- Backend Fetch ---------- */
async function fetchJSON(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
    }
  }
}

async function fetchPage(p = 1, limit = PAGE_LIMIT, snapshot) {
  const url = new URL('/news', location.origin);
  url.searchParams.set('page', String(p));
  url.searchParams.set('limit', String(limit));
  if (snapshot) url.searchParams.set('snapshot', snapshot);

  const r = await fetchJSON(url.toString());
  return {
    items: Array.isArray(r?.articles) ? r.articles : [],
    totalPages: r?.totalPages || 0,
    page: r?.page || p,
    snapshot: r?.snapshot || null,
  };
}


async function fetchAllArticles() {
  const first = await fetchPage(1, PAGE_LIMIT);
  const total = Math.min(first.totalPages || 1, MAX_PAGES_CAP);
  let all = [...first.items];

  if (total > 1) {
    const tasks = [];
    for (let p = 2; p <= total; p++) {
      tasks.push(fetchPage(p, PAGE_LIMIT, first.snapshot)); // reuse same snapshot
    }
    const rest = await Promise.all(tasks);
    for (const r of rest) all.push(...r.items);
  }
  return all;
}


async function serverTopId() {
  const r = await fetchPage(1, 1);
  const a = r.items[0];
  return a ? a._id || a.link || "" : "";
}

async function ensureCache() {
  let cache = loadCache();

  if (!isCacheFresh(cache)) {
    showLoading();
    const articles = await fetchAllArticles();
    cache = indexArticles(articles);
    saveCache(cache);
    hideLoading();
    return cache;
  }

  try {
    const topServer = await serverTopId();
    const topCache = cache.order[0] || "";
    if (topServer && topServer !== topCache) {
      showLoading();
      const articles = await fetchAllArticles();
      cache = indexArticles(articles);
      saveCache(cache);
      hideLoading();
    }
  } catch { /* ignore network error */ }

  return cache;
}

/* ---------- Navigation State ---------- */
let scope = loadScope();
let snapshotIds = [];
let idx = 0;
let cacheRef = null;
let atEnd = false;

/* ---------- UI Helpers ---------- */
function updateScopeUI() {
  if (scopeSelect) scopeSelect.value = scope;
  if (scopeToggleBtn) {
    scopeToggleBtn.textContent = scope === "unread" ? "All News" : "Unread News";
  }
}
function renderArticle(a) {
  const title   = escapeHTML(a.title || "");
  const source  = escapeHTML(a.source || "");
  const link    = a.link || "#";
  const summary = escapeHTML(a.summary || "");

  newsContainer.innerHTML = `
    <div class="news-card">
      <h2>${title}</h2>
      ${a.image ? `<img src="${a.image}" alt="" loading="lazy">` : ``}
      <p>${summary}</p>
      <a href="${link}" target="_blank" rel="noopener">Read full article on ${source} ➜</a>
    </div>
  `;

  const nextId = snapshotIds[idx + 1];
  const nextArt = nextId ? cacheRef.map[nextId] : null;
  if (nextArt?.image) {
    const img = new Image();
    img.src = nextArt.image;
  }
}
function renderEmpty() {
  newsContainer.innerHTML = `
    <div class="news-card empty-state">
      <h2>You're all caught up 🎉</h2>
      <p>No unread articles right now.</p>
    </div>
  `;
  const btn = document.getElementById("viewAllBtn");
  if (btn) btn.onclick = () => setScope("all");
}
function showEndCard() {
  renderEmpty();
  atEnd = true;
  updateNav();
}
function updateNav() {
  const hasArticles = snapshotIds.length > 0;
  if (!hasArticles) {
    prevBtn && (prevBtn.disabled = true);
    nextBtn && (nextBtn.disabled = true);
    return;
  }
  if (scope === "unread") {
    prevBtn && (prevBtn.disabled = atEnd ? false : idx <= 0);
    nextBtn && (nextBtn.disabled = atEnd);
  } else {
    prevBtn && (prevBtn.disabled = idx <= 0);
    nextBtn && (nextBtn.disabled = idx >= snapshotIds.length - 1);
  }
}

/* ---------- Snapshot / Scope ---------- */
async function buildSnapshot() {
  cacheRef = await ensureCache();
  const rm = pruneReadMap();
  let ids = (scope === "all")
    ? cacheRef.order.slice()
    : cacheRef.order.filter(id => !rm[id]);
  if (scope === "all" && !ids.length) ids = cacheRef.order.slice();
  snapshotIds = ids;
}
function showAtIndex(i = 0) {
  if (!snapshotIds.length) {
    atEnd = true;
    renderEmpty();
    prevBtn && (prevBtn.disabled = true);
    nextBtn && (nextBtn.disabled = true);
    return;
  }
  atEnd = false;
  idx = Math.max(0, Math.min(i, snapshotIds.length - 1));
  const id = snapshotIds[idx];
  const a = cacheRef.map[id];
  if (!a) return;
  renderArticle(a);
  markRead(id);
  updateNav();
}
async function setScope(nextScope) {
  scope = nextScope;
  atEnd = false;
  saveScope(scope);
  updateScopeUI();
  await buildSnapshot();
  showAtIndex(0);
}

/* ---------- Loading Indicator ---------- */
function showLoading() {
  if (!newsContainer) return;
  newsContainer.innerHTML = `
    <div class="news-card">
      <p>Loading latest news…</p>
    </div>
  `;
}
function hideLoading() {}

/* ---------- Nav Handlers ---------- */
function handleNext() {
  if (!snapshotIds.length) return;
  if (scope === "unread") {
    if (atEnd) return;
    if (idx < snapshotIds.length - 1) {
      showAtIndex(idx + 1);
    } else {
      showEndCard();
    }
  } else {
    if (idx < snapshotIds.length - 1) showAtIndex(idx + 1);
  }
}
function handlePrev() {
  if (!snapshotIds.length) return;
  if (scope === "unread") {
    if (atEnd) {
      atEnd = false;
      showAtIndex(snapshotIds.length - 1);
      return;
    }
    if (idx > 0) showAtIndex(idx - 1);
  } else {
    if (idx > 0) showAtIndex(idx - 1);
  }
}

/* ---------- Event Bindings ---------- */
prevBtn?.addEventListener("click", handlePrev);
nextBtn?.addEventListener("click", handleNext);
prevBtnAlt?.addEventListener("click", handlePrev);
nextBtnAlt?.addEventListener("click", handleNext);

latestBtn?.addEventListener("click", () => setScope("unread"));
scopeSelect?.addEventListener("change", e => setScope(e.target.value));
scopeToggleBtn?.addEventListener("click", () =>
  setScope(scope === "unread" ? "all" : "unread")
);

window.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") handlePrev();
  if (e.key === "ArrowRight") handleNext();
});

/* ---------- Touch Swipe Navigation ---------- */
let touchStartX = 0, touchStartY = 0;
window.addEventListener("touchstart", e => {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });
window.addEventListener("touchend", e => {
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
    if (dx > 0) handlePrev();
    else handleNext();
  }
}, { passive: true });

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  updateScopeUI();
  showLoading();
  try {
    await buildSnapshot();
    showAtIndex(0);
  } catch (e) {
    newsContainer.innerHTML = `
      <div class="news-card">
        <p>Couldn’t load news. Please refresh.</p>
      </div>
    `;
    console.error("Boot error:", e?.message || e);
  }
});
