/* ============================================================
   Live Maritime News Feed — RSS aggregator via rss2json proxy
   Fetches every 30 min, persists to localStorage, merges with
   static data.news so old items are never lost.
   ============================================================ */

const LIVE_SOURCES = [
  { key: "GCAP",  name: "gCaptain",          tag: "NEWS", color: "#46c976",
    url: "https://gcaptain.com/feed/" },
  { key: "S4S",   name: "Safety4Sea",         tag: "NEWS", color: "#33d6c8",
    url: "https://safety4sea.com/feed/" },
  { key: "SPL",   name: "Splash247",          tag: "NEWS", color: "#e05c20",
    url: "https://splash247.com/feed/" },
  { key: "NVT",   name: "Naval Today",        tag: "GOV",  color: "#5577dd",
    url: "https://navaltoday.com/feed/" },
  { key: "MAREX", name: "Maritime Executive", tag: "NEWS", color: "#3fae6a",
    url: "https://maritime-executive.com/rss/articles" },
];

// Register source entries so SrcChip can look them up
if (window.MDA_DATA && window.MDA_DATA.sources) {
  LIVE_SOURCES.forEach(s => {
    window.MDA_DATA.sources[s.key] = { name: s.name, tag: s.tag, color: s.color };
  });
}

const RSS2JSON_BASE = "https://api.rss2json.com/v1/api.json?rss_url=";
const CACHE_KEY     = "MDA_LIVE_NEWS_v2";
const REFRESH_MS    = 30 * 60 * 1000; // 30 minutes

/* ---- helpers ---- */
function mdaTimeAgo(dateStr, lang) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (lang === "th") {
    if (m < 1)  return "เมื่อกี้";
    if (m < 60) return m + " นาทีที่แล้ว";
    if (h < 24) return h + " ชั่วโมงที่แล้ว";
    return d + " วันที่แล้ว";
  }
  if (m < 1)  return "just now";
  if (m < 60) return m + "m ago";
  if (h < 24) return h + "h ago";
  return d + "d ago";
}

function stripHtml(str) {
  return (str || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 280);
}

function makeLiveItem(src, item, index) {
  const idRaw = src.key + "_" + (item.pubDate || Date.now()).toString().replace(/\W/g, "").slice(0, 16) + "_" + index;
  return {
    id: "live_" + idRaw,
    srcKey:      src.key,
    outlet:      src.name,
    cat:         "MARITIME",
    raw:         { th: item.title || "", en: item.title || "" },
    ai:          { th: stripHtml(item.description), en: stripHtml(item.description) },
    ago:         null,
    time:        item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    fetchedAt:   new Date().toISOString(),
    reliability: "B",
    credibility: "2",
    verdict:     "unverified",
    url:         item.link || "#",
    isLive:      true,
  };
}

async function fetchOneFeed(src) {
  const url = RSS2JSON_BASE + encodeURIComponent(src.url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const j   = await res.json();
    if (j.status !== "ok" || !Array.isArray(j.items)) return [];
    return j.items.map((item, i) => makeLiveItem(src, item, i));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function aiSummarizeTh(items) {
  // Only items that don't yet have a Thai summary
  const needSummary = items.filter(n => n.isLive && n.raw.en === n.raw.th);
  if (!needSummary.length) return items;
  try {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: needSummary.map((n, i) => ({
          index: i,
          id: n.id,
          title: n.raw.en,
          description: n.ai.en,
        }))
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined,
    });
    const data = await res.json();
    if (!data.summaries || data.error) return items;
    const byId = {};
    data.summaries.forEach((s, i) => {
      const orig = needSummary[s.index !== undefined ? s.index : i];
      if (orig) byId[orig.id] = s;
    });
    return items.map(n => {
      const s = byId[n.id];
      if (!s) return n;
      return {
        ...n,
        raw: { th: s.th_title || n.raw.en, en: n.raw.en },
        ai:  { th: s.th_summary || n.ai.en, en: n.ai.en },
      };
    });
  } catch {
    return items;
  }
}

async function fetchAllLiveNews() {
  const results = await Promise.allSettled(LIVE_SOURCES.map(fetchOneFeed));
  const items = [];
  results.forEach(r => { if (r.status === "fulfilled") items.push(...r.value); });
  items.sort((a, b) => new Date(b.time) - new Date(a.time));
  return aiSummarizeTh(items);
}

/* ---- localStorage cache ---- */
function loadNewsCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNewsCache(items) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch {}
}

function mergeWithBase(live, base) {
  const liveIds = new Set(live.map(n => n.id));
  const baseFallback = base.filter(n => !liveIds.has(n.id));
  return [...live, ...baseFallback];
}

/* ---- React hook ---- */
function useNewsUpdater(baseNews) {
  const [liveNews, setLiveNews] = React.useState(loadNewsCache);
  const [fetching, setFetching] = React.useState(false);
  const [lastFetch, setLastFetch] = React.useState(null);
  const [fetchError, setFetchError] = React.useState(null);

  const doFetch = React.useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const items = await fetchAllLiveNews();
      if (items.length > 0) {
        saveNewsCache(items);
        setLiveNews(items);
      }
      setLastFetch(new Date());
    } catch (err) {
      setFetchError(err.message || "fetch failed");
    } finally {
      setFetching(false);
    }
  }, []);

  React.useEffect(() => {
    const cached = loadNewsCache();
    const stale = cached.length === 0 ||
      !cached[0] ||
      (Date.now() - new Date(cached[0].fetchedAt || 0).getTime() > REFRESH_MS);
    if (stale) doFetch();
    const id = setInterval(doFetch, REFRESH_MS);
    return () => clearInterval(id);
  }, [doFetch]);

  const merged = React.useMemo(
    () => mergeWithBase(liveNews, baseNews),
    [liveNews, baseNews]
  );

  return { news: merged, liveCount: liveNews.length, fetching, lastFetch, fetchError, doFetch };
}

Object.assign(window, { useNewsUpdater, mdaTimeAgo, LIVE_SOURCES, fetchAllLiveNews });
