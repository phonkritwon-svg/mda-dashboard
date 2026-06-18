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
const LASTFETCH_KEY = "MDA_LAST_FETCH";
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

// ── การแปลเป็นไทย: เก็บแคช + แปลทั้งหมด ──
const TRANSLATION_CACHE_KEY = "MDA_TRANSLATIONS_v1";

function loadTranslationCache() {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveTranslationCache(cache) {
  try { localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// hash = simple id for caching by content
function contentHash(text) {
  let h = 0;
  for (let i = 0; i < Math.min(text.length, 100); i++) {
    h = ((h << 5) - h) + text.charCodeAt(i);
    h = h & h; // Convert to 32bit integer
  }
  return String(Math.abs(h));
}

async function aiSummarizeTh(items) {
  const cache = loadTranslationCache();
  const needTranslate = items.filter(n => {
    const hash = contentHash(n.raw.en || "");
    return !cache[hash];
  });

  if (!needTranslate.length) {
    // apply cached translations
    return items.map(n => {
      const hash = contentHash(n.raw.en || "");
      const cached = cache[hash];
      if (!cached) return n;
      return {
        ...n,
        raw: { th: cached.th_title || n.raw.en, en: n.raw.en },
        ai:  { th: cached.th_summary || n.ai.en, en: n.ai.en },
      };
    });
  }

  try {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: needTranslate.map((n, i) => ({
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

    // บันทึกลง cache
    const newCache = { ...cache };
    data.summaries.forEach((s, i) => {
      const orig = needTranslate[s.index !== undefined ? s.index : i];
      if (orig) {
        const hash = contentHash(orig.raw.en || "");
        newCache[hash] = s;
      }
    });
    saveTranslationCache(newCache);

    // apply to all items
    return items.map(n => {
      const hash = contentHash(n.raw.en || "");
      const s = newCache[hash];
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

/* ---- localStorage cache (offline fallback) ---- */
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

/* ---- Supabase: shared central news store ---- */
function rowToItem(r) {
  return {
    id:          r.id,
    srcKey:      r.src_key,
    outlet:      r.outlet,
    cat:         r.category,
    raw:         { th: r.title_th || r.title_en, en: r.title_en },
    ai:          { th: r.summary_th || r.summary_en, en: r.summary_en },
    time:        r.published_at,
    fetchedAt:   r.fetched_at,
    reliability: r.reliability,
    credibility: r.credibility,
    verdict:     r.verdict,
    url:         r.url,
    linkedInc:   r.linked_inc,
    isLive:      r.is_live,
  };
}

function itemToRow(n) {
  return {
    id:           n.id,
    src_key:      n.srcKey,
    outlet:       n.outlet,
    category:     n.cat,
    title_en:     n.raw.en,
    title_th:     n.raw.th !== n.raw.en ? n.raw.th : null,
    summary_en:   n.ai.en,
    summary_th:   n.ai.th !== n.ai.en ? n.ai.th : null,
    url:          n.url,
    reliability:  n.reliability,
    credibility:  n.credibility,
    verdict:      n.verdict,
    linked_inc:   n.linkedInc || null,
    is_live:      true,
    published_at: n.time,
    fetched_at:   n.fetchedAt || new Date().toISOString(),
  };
}

async function loadFromSupabase() {
  const SB = window.MDA_SB;
  if (!SB) return [];
  try {
    const { data, error } = await SB
      .from("news").select("*")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) { console.warn("[MDA] supabase read", error.message); return []; }
    return (data || []).map(rowToItem);
  } catch (e) {
    console.warn("[MDA] supabase read failed", e);
    return [];
  }
}

// คิวรีคลังข่าวย้อนหลังตามช่วงเวลา (ทะลุ limit 200 ของฟีดสด → เข้าถึงประวัติทั้งหมด) + แปลไทย
async function queryNewsArchive(sinceISO, untilISO, limit) {
  const SB = window.MDA_SB;
  if (!SB) return [];
  try {
    let q = SB.from("news").select("*")
      .order("published_at", { ascending: false })
      .limit(limit || 2000);
    if (sinceISO) q = q.gte("published_at", sinceISO);
    if (untilISO) q = q.lte("published_at", untilISO);
    const { data, error } = await q;
    if (error) { console.warn("[MDA] news archive read", error.message); return []; }
    let items = (data || []).map(rowToItem);
    items = await aiSummarizeTh(items);
    return items;
  } catch (e) {
    console.warn("[MDA] news archive read failed", e);
    return [];
  }
}

async function pushToSupabase(items) {
  const SB = window.MDA_SB;
  if (!SB || !items.length) return;
  try {
    const rows = items.map(itemToRow);
    const { error } = await SB.from("news").upsert(rows, { onConflict: "id" });
    if (error) console.warn("[MDA] supabase upsert", error.message);
  } catch (e) {
    console.warn("[MDA] supabase upsert failed", e);
  }
}

/* ---- React hook ---- */
function useNewsUpdater(baseNews) {
  const [liveNews, setLiveNews] = React.useState(loadNewsCache);
  const [fetching, setFetching] = React.useState(false);
  const [lastFetch, setLastFetch] = React.useState(null);
  const [fetchError, setFetchError] = React.useState(null);

  // อ่านข่าวกลางจาก Supabase (ข่าวถูกเขียนโดย cron ฝั่ง server ทุกวัน)
  // ถ้า DB ว่าง → fallback ดึง RSS มาแสดงชั่วคราว (ไม่เขียนกลับ)
  const doFetch = React.useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      let shared = await loadFromSupabase();
      if (!shared.length) shared = await fetchAllLiveNews();   // display-only fallback
      if (shared.length) {
        saveNewsCache(shared);
        setLiveNews(shared);
      }
      try { localStorage.setItem(LASTFETCH_KEY, String(Date.now())); } catch {}
      setLastFetch(new Date());
    } catch (err) {
      setFetchError(err.message || "fetch failed");
    } finally {
      setFetching(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      // แสดงข่าวกลางจาก Supabase ทันที + แปลเป็นไทย
      let shared = await loadFromSupabase();
      if (active && shared.length) {
        shared = await aiSummarizeTh(shared);
        saveNewsCache(shared);
        setLiveNews(shared);
      } else if (active) {
        doFetch();   // DB ว่าง → fallback
      }
    })();
    // อ่านซ้ำเป็นระยะ เพื่อรับข่าวที่ cron อัปเดต
    const id = setInterval(doFetch, REFRESH_MS);
    return () => { active = false; clearInterval(id); };
  }, [doFetch]);

  // ── Supabase Realtime: ข่าวใหม่/อัปเดต เด้งเข้าทันที (~1 วินาที) + แปลไทย ──
  React.useEffect(() => {
    const SB = window.MDA_SB;
    if (!SB || !SB.channel) return;
    const applyRow = async (row) => {
      if (!row) return;
      let item = rowToItem(row);
      item = (await aiSummarizeTh([item]))[0];
      setLiveNews(prev => {
        const map = new Map(prev.map(n => [n.id, n]));
        map.set(item.id, item);
        const arr = Array.from(map.values())
          .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
        saveNewsCache(arr);
        return arr;
      });
      setLastFetch(new Date());
    };
    // ชื่อ channel ไม่ซ้ำต่อ instance (hook ถูกเรียกหลายจอ) — กันชน topic เดิม
    const ch = SB.channel("rt-news-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, (p) => applyRow(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "news" }, (p) => applyRow(p.new))
      .subscribe();
    return () => { try { SB.removeChannel(ch); } catch (e) { /* ignore */ } };
  }, []);

  const merged = React.useMemo(
    () => mergeWithBase(liveNews, baseNews),
    [liveNews, baseNews]
  );

  return { news: merged, liveCount: liveNews.length, fetching, lastFetch, fetchError, doFetch };
}

Object.assign(window, {
  useNewsUpdater, mdaTimeAgo, LIVE_SOURCES, fetchAllLiveNews,
  loadFromSupabase, pushToSupabase, queryNewsArchive, aiSummarizeTh,
  loadTranslationCache, saveTranslationCache,
});
