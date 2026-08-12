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

  /* ── ข่าวในประเทศไทย (Google News RSS ภาษาไทย) ───────────────────
     ฟีดอังกฤษด้านบนแทบไม่รายงานเหตุในน่านน้ำไทยเลย แดชบอร์ดของ ศรชล.
     จึงเห็นแต่ทะเลแดง/ทะเลจีนใต้ ทั้งที่พื้นที่รับผิดชอบจริงคืออ่าวไทย-อันดามัน

     ผูก query กับภัยคุกคาม 9 ด้าน ไม่ใช่ดึงข่าวในประเทศมาทั้งหมด
     มิฉะนั้นจะกลายเป็นเครื่องอ่านข่าวทั่วไป ไม่ใช่ภาพสถานการณ์ทางทะเล
     (ชุดเดียวกับใน api/cron-news.py — แก้ที่ไหนควรแก้ทั้งสองที่)      */
  { key: "THNEWS", name: "ในประเทศ (Google News)", tag: "NEWS", color: "#46c976",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent(
      "(ประมงผิดกฎหมาย OR เรือประมง OR ลอบจับสัตว์น้ำ OR \"แรงงานประมง\") "
      + "(จับกุม OR ตรวจยึด OR ไทย) when:14d") + "&hl=th&gl=TH&ceid=TH:th" },
  { key: "THNEWS", name: "ในประเทศ (Google News)", tag: "NEWS", color: "#46c976",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent(
      "(ลักลอบขนส่ง OR ค้ามนุษย์ OR ยาเสพติด) (ชายแดน OR ท่าเรือ OR ทางทะเล) when:14d")
      + "&hl=th&gl=TH&ceid=TH:th" },
  { key: "THNEWS", name: "ในประเทศ (Google News)", tag: "NEWS", color: "#46c976",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent(
      "(เรือล่ม OR เรือจม OR กู้ภัยทางทะเล OR \"คลื่นลมแรง\" OR \"น้ำมันรั่ว\") when:14d")
      + "&hl=th&gl=TH&ceid=TH:th" },
  { key: "THNEWS", name: "ในประเทศ (Google News)", tag: "NEWS", color: "#46c976",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent(
      "(ศรชล OR \"กองทัพเรือ\" OR \"ตำรวจน้ำ\" OR \"กรมเจ้าท่า\") "
      + "(ปฏิบัติการ OR ตรวจการณ์ OR จับกุม) when:14d") + "&hl=th&gl=TH&ceid=TH:th" },

  /* ── สำนักข่าวไทยโดยตรง ─────────────────────────────────────────
     เหตุผลที่ต้องมีทั้งที่ Google News ครอบคลุมกว่า: Google News ให้
     ลิงก์ redirect ของตัวเองแทน URL บทความ และไม่ส่งรูปมาเลยสักชิ้น
     (ตรวจแล้ว 40/40 ไม่มีรูป) ทั้งยังถอดหา URL จริงไม่ได้ เพราะหน้า
     interstitial แปลงด้วย JS ฝั่งไคลเอนต์

     ฟีดตรงของสำนักข่าวให้ URL จริงและมีรูปครบทุกชิ้น แลกกับการที่เป็น
     ข่าวรวมทุกหมวด จึงต้องผ่าน filterMaritime ก่อน
     วัดจริง: ผ่านตัวกรองราว 5% ของฟีด — ได้ข่าวไทยมีรูปวันละไม่กี่ชิ้น
     ไม่ใช่ทุกชิ้น แต่ดีกว่าศูนย์                                      */
  { key: "KHAOSOD", name: "ข่าวสด", tag: "NEWS", color: "#e05c20", filterMaritime: true,
    url: "https://www.khaosod.co.th/around-thailand/feed" },
  { key: "KHAOSOD", name: "ข่าวสด", tag: "NEWS", color: "#e05c20", filterMaritime: true,
    url: "https://www.khaosod.co.th/crime/feed" },
  { key: "MATICHON", name: "มติชน", tag: "NEWS", color: "#33d6c8", filterMaritime: true,
    url: "https://www.matichon.co.th/region/feed" },
];

// Register source entries so SrcChip can look them up
if (window.MDA_DATA && window.MDA_DATA.sources) {
  LIVE_SOURCES.forEach(s => {
    window.MDA_DATA.sources[s.key] = { name: s.name, tag: s.tag, color: s.color };
  });
}

/* อ่าน RSS ผ่านเซิร์ฟเวอร์ของเราเอง (api/rss.py) ไม่ใช่ api.rss2json.com
   ของเดิมเป็นบริการฟรีของบุคคลที่สามที่จำกัดอัตราการเพิ่มฟีดใหม่ — พอเติม
   แหล่งข่าวไทยเข้าไปสามฟีด ทุกฟีดใหม่ตอบ 429 ทันที ฟีดข่าวทั้งระบบจึงขึ้น
   อยู่กับโควตาของคนอื่น · ตัวเราเองยังคืนข่าวครบกว่าด้วย (rss2json ตัดเหลือ 10) */
const RSS2JSON_BASE = "/api/rss?url=";
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

/* หารูปประกอบข่าวจากฟีด — แต่ละสำนักข่าวใส่มาคนละที่
   enclosure (Naval Today, Splash247) · thumbnail · หรือ <img> ตัวแรกในเนื้อ
   คืนค่าว่างถ้าไม่มี ซึ่งเป็นกรณีปกติ: gCaptain และ Google News
   (ที่มาของข่าวไทยทั้งหมด) ไม่ส่งรูปมาเลย ผู้เรียกต้องรับมือกับค่าว่างได้ */
function feedImage(item) {
  const enc = (item.enclosure && item.enclosure.link) || "";
  if (/^https?:\/\//i.test(enc)) return enc;
  const thumb = (item.thumbnail || "").trim();
  if (/^https?:\/\//i.test(thumb)) return thumb;
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(item.content || item.description || "");
  return m && /^https?:\/\//i.test(m[1]) ? m[1] : "";
}

function makeLiveItem(src, item, index) {
  const idRaw = src.key + "_" + (item.pubDate || Date.now()).toString().replace(/\W/g, "").slice(0, 16) + "_" + index;
  return {
    id: "live_" + idRaw,
    image:       feedImage(item),
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

/* ── ตัวกรองความเกี่ยวข้องทางทะเล (เฉพาะฟีดข่าวทั่วไปของไทย) ─────────
   ฟีดสำนักข่าวไทยเป็นข่าวรวมทุกหมวด วัดจริงแล้วมีเนื้อหาทางทะเลราว 5%
   ถ้ารับหมดแดชบอร์ดจะกลายเป็นหน้าอ่านข่าวทั่วไป จึงต้องมีจุดยึดทางทะเล
   อย่างน้อยหนึ่งคำ — ตั้งใจไม่ใส่คำกว้างอย่าง "ลักลอบ" หรือ "เกาะ" ลอย ๆ
   เพราะทดสอบแล้วดึงข่าวลักลอบนำเข้าหมูแช่แข็งกับข่าวภูเก็ตทั่วไปเข้ามาด้วย

   ยังหลุดรอดบ้างเป็นเรื่องปกติ — คัดแคบเกินไปจะเสียข่าวจริงมากกว่าที่ได้ */
const TH_MARITIME_RE = new RegExp([
  "ทางทะเล|ในทะเล|กลางทะเล|ชายฝั่ง|น่านน้ำ|อ่าวไทย|อันดามัน",
  "เรือประมง|เรือล่ม|เรือจม|เรืออับปาง|เรือบรรทุก|เรือสินค้า|เรือตรวจการณ์|เรือรบ",
  "ประมง|อวนลาก|อวนครอบ|จับสัตว์น้ำ|ท่าเทียบเรือ|กรมเจ้าท่า|กรมประมง",
  "ศรชล|กองทัพเรือ|ทัพเรือภาค|ทหารเรือ|ตำรวจน้ำ",
  "น้ำมันรั่ว|มลพิษทางทะเล|เต่าทะเล|พะยูน|ปะการัง",
  "โรฮีนจา|เกาะกูด|เกาะกง|รุกล้ำน่านน้ำ|จมทะเล|ดำน้ำ",
].join("|"));

async function fetchOneFeed(src) {
  const url = RSS2JSON_BASE + encodeURIComponent(src.url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const j   = await res.json();
    if (j.status !== "ok" || !Array.isArray(j.items)) return [];
    let items = j.items;
    if (src.filterMaritime) {
      items = items.filter(it =>
        TH_MARITIME_RE.test((it.title || "") + " " + stripHtml(it.description || "")));
    }
    return items.map((item, i) => makeLiveItem(src, item, i));
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

// มีอักษรไทยอยู่แล้วหรือไม่ (ถ้ามี ไม่ต้องแปล)
function hasThai(text) {
  return /[฀-๿]/.test(text || "");
}

// แปล 1 ข้อความด้วย Google Translate (endpoint ฟรี ไม่ต้องมี key)
async function gtransTh(text) {
  if (!text || !text.trim() || hasThai(text)) return text || "";
  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", "th");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text.slice(0, 500));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    return (data[0] || []).map(p => p[0] || "").join("") || text;
  } catch {
    return text;   // แปลไม่สำเร็จ → ใช้ต้นฉบับ
  }
}

function applyTranslationCache(items, cacheObj) {
  return items.map(n => {
    const hash = contentHash(n.raw.en || "");
    const cached = cacheObj[hash];
    if (!cached) return n;
    return {
      ...n,
      raw: { th: cached.th_title || n.raw.en, en: n.raw.en },
      ai:  { th: cached.th_summary || n.ai.en, en: n.ai.en },
    };
  });
}

async function aiSummarizeTh(items) {
  const cache = loadTranslationCache();
  const needTranslate = items.filter(n => {
    const hash = contentHash(n.raw.en || "");
    return !cache[hash] && !hasThai(n.raw.th);   // ข้ามข่าวที่เป็นไทยแล้ว
  });

  if (!needTranslate.length) return applyTranslationCache(items, cache);

  // 1) ลองใช้ AI summarize ฝั่ง server ก่อน (ใช้ได้เฉพาะบน Vercel)
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
    if (data.summaries && !data.error) {
      const newCache = { ...cache };
      data.summaries.forEach((s, i) => {
        const orig = needTranslate[s.index !== undefined ? s.index : i];
        if (orig) {
          const hash = contentHash(orig.raw.en || "");
          newCache[hash] = s;
        }
      });
      saveTranslationCache(newCache);
      return applyTranslationCache(items, newCache);
    }
  } catch { /* server ไม่พร้อม → ใช้ fallback ด้านล่าง */ }

  // 2) Fallback: แปลด้วย Google Translate ทีละข่าว (ขนานกันทั้งหมด)
  const newCache = { ...cache };
  await Promise.allSettled(needTranslate.map(async n => {
    const [thTitle, thSummary] = await Promise.all([
      gtransTh(n.raw.en),
      gtransTh(n.ai.en),
    ]);
    const changed = (thTitle && thTitle !== n.raw.en) || (thSummary && thSummary !== n.ai.en);
    if (changed) {
      const hash = contentHash(n.raw.en || "");
      newCache[hash] = { th_title: thTitle, th_summary: thSummary };
    }
  }));
  saveTranslationCache(newCache);
  return applyTranslationCache(items, newCache);
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

/* ── กฎ: แสดงเฉพาะข่าวที่มีแหล่งอ้างอิงตรวจสอบได้ ──
   ข่าวใดไม่มีลิงก์ต้นฉบับ (url ว่าง หรือเป็น "#") ถือว่าไม่มีที่มา → ไม่นำมาแสดง
   ป้องกันข่าวที่สร้างขึ้นเองหรือดึงมาไม่สมบูรณ์ปนเข้ามาในฟีดข่าวกรอง */
function hasVerifiableSource(n) {
  return !!(n && typeof n.url === "string" && /^https?:\/\/\S+$/i.test(n.url.trim()));
}

function mergeWithBase(live, base) {
  const liveIds = new Set(live.map(n => n.id));
  const baseFallback = base.filter(n => !liveIds.has(n.id));
  const all = [...live, ...baseFallback];
  const kept = all.filter(hasVerifiableSource);
  const dropped = all.length - kept.length;
  if (dropped > 0) {
    console.warn("[MDA] ตัดข่าวที่ไม่มีแหล่งอ้างอิงออก " + dropped + " ชิ้น จากทั้งหมด " + all.length);
  }
  return kept;
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
    let items = (data || []).map(rowToItem).filter(hasVerifiableSource);
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

  // เปิดให้หน้าอื่นเข้าถึงคลังข่าวล่าสุด (หน้ารายละเอียดใช้หาข่าวที่เกี่ยวข้อง)
  React.useEffect(() => { window.MDA_ALL_NEWS = merged; }, [merged]);

  return { news: merged, liveCount: liveNews.length, fetching, lastFetch, fetchError, doFetch };
}

/* ============================================================
   AIS สด — ดึงตำแหน่งเรือจริงจากเซิร์ฟเวอร์ (/api/vessels)
   เซิร์ฟเวอร์เป็นผู้ถือ AISSTREAM_API_KEY และเปิด WebSocket ค้างไว้
   หน้าเว็บแค่มาดึงภาพรวมล่าสุดทุก 15 วินาที → หมุดขยับตามเรือจริง
   ============================================================ */
const AIS_POLL_MS = 15000;

function useLiveVessels() {
  const [vessels, setVessels] = React.useState([]);
  const [ais, setAis] = React.useState({ connected: false, error: null, count: 0 });

  React.useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/api/vessels", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (!alive) return;
        setAis({ connected: !!j.connected, error: j.error || null, count: j.count || 0 });
        setVessels(Array.isArray(j.vessels) ? j.vessels : []);
      } catch (e) {
        if (alive) setAis(a => ({ ...a, connected: false, error: "เชื่อมต่อเซิร์ฟเวอร์ AIS ไม่ได้" }));
      }
    };
    pull();
    const id = setInterval(pull, AIS_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { aisVessels: vessels, ais };
}

Object.assign(window, {
  useLiveVessels,
  useNewsUpdater, mdaTimeAgo, LIVE_SOURCES, fetchAllLiveNews,
  loadFromSupabase, pushToSupabase, queryNewsArchive, aiSummarizeTh,
  loadTranslationCache, saveTranslationCache, hasVerifiableSource,
});
