/* ============================================================
   Events / Incidents — central store via Supabase
   เหตุการณ์มาจากตาราง public.events:
     • cron สร้างอัตโนมัติจากข่าวภัยสูง (origin='cron')
     • เจ้าหน้าที่เพิ่มเองผ่านฟอร์ม (origin='manual')
   อ่านได้ทุกคน · เขียนได้เฉพาะผู้ login (RLS) หรือ cron (service_role)
   ============================================================ */

const EVENTS_CACHE_KEY  = "MDA_EVENTS_v1";
const EVENTS_REFRESH_MS = 5 * 60 * 1000;   // sync ทุก 5 นาที

/* พื้นที่ทางทะเลพร้อมพิกัด (ใช้ในฟอร์มเพิ่มเหตุการณ์) */
const REGION_PRESETS = [
  { key: "redsea",   th: "ทะเลแดง / บับเอลมันเดบ", en: "Red Sea / Bab el-Mandeb", lat: 13.5, lon: 43.3 },
  { key: "hormuz",   th: "ช่องแคบฮอร์มุซ",         en: "Strait of Hormuz",       lat: 26.5, lon: 56.3 },
  { key: "aden",     th: "อ่าวเอเดน",              en: "Gulf of Aden",           lat: 12.5, lon: 47.0 },
  { key: "scs",      th: "ทะเลจีนใต้",             en: "South China Sea",        lat: 15.0, lon: 117.0 },
  { key: "malacca",  th: "ช่องแคบมะละกา",          en: "Strait of Malacca",      lat: 2.5,  lon: 101.0 },
  { key: "gulfthai", th: "อ่าวไทย",               en: "Gulf of Thailand",       lat: 9.5,  lon: 101.5 },
  { key: "andaman",  th: "ทะเลอันดามัน",           en: "Andaman Sea",            lat: 8.0,  lon: 97.0 },
  { key: "natuna",   th: "ทะเลนาตูนาเหนือ",        en: "North Natuna Sea",       lat: 5.0,  lon: 109.2 },
  { key: "black",    th: "ทะเลดำ",                en: "Black Sea",              lat: 44.0, lon: 36.0 },
  { key: "baltic",   th: "ทะเลบอลติก",            en: "Baltic Sea",             lat: 59.0, lon: 21.0 },
  { key: "custom",   th: "กำหนดพิกัดเอง",          en: "Custom coordinates",     lat: 0,    lon: 0 },
];

/* จับคู่ข้อความข่าว → พิกัดพื้นที่ทางทะเล (ใช้ปักหมุด "ดูบนแผนที่" จากฟีดข่าว)
   ตรงกับชุดภูมิภาคในฝั่ง cron (api/cron-news.py) */
const MDA_GEO_REGIONS = [
  { re: /red sea|bab[- ]?el[- ]?mandeb|hodeida|yemen/i,        th: "ทะเลแดง / บับเอลมันเดบ",    en: "Red Sea / Bab el-Mandeb", lat: 13.5, lon: 43.3 },
  { re: /strait of hormuz|hormuz|fujairah|persian gulf/i,      th: "ช่องแคบฮอร์มุซ",            en: "Strait of Hormuz",        lat: 26.5, lon: 56.3 },
  { re: /gulf of aden|\baden\b/i,                              th: "อ่าวเอเดน",                 en: "Gulf of Aden",            lat: 12.5, lon: 47.0 },
  { re: /south china sea|scarborough|spratly|paracel|second thomas|taiwan strait/i, th: "ทะเลจีนใต้", en: "South China Sea", lat: 15.0, lon: 117.0 },
  { re: /strait of malacca|malacca|singapore strait/i,         th: "ช่องแคบมะละกา",             en: "Strait of Malacca",       lat: 2.5,  lon: 101.0 },
  { re: /gulf of thailand/i,                                   th: "อ่าวไทย",                   en: "Gulf of Thailand",        lat: 9.5,  lon: 101.5 },
  { re: /andaman/i,                                            th: "ทะเลอันดามัน",              en: "Andaman Sea",             lat: 8.0,  lon: 97.0 },
  { re: /natuna/i,                                             th: "ทะเลนาตูนาเหนือ",           en: "North Natuna Sea",        lat: 5.0,  lon: 109.2 },
  { re: /black sea|novorossiysk|odes[as]|crimea/i,            th: "ทะเลดำ",                    en: "Black Sea",               lat: 44.0, lon: 36.0 },
  { re: /baltic|gulf of finland|kattegat|gotland/i,           th: "ทะเลบอลติก",                en: "Baltic Sea",              lat: 59.0, lon: 21.0 },
  { re: /gulf of guinea|nigeria|lagos/i,                       th: "อ่าวกินี",                  en: "Gulf of Guinea",          lat: 3.0,  lon: 5.0 },
  { re: /somali|horn of africa|gulf of oman|arabian sea/i,    th: "ทะเลอาหรับ / จะงอยแอฟริกา", en: "Arabian Sea / Horn",      lat: 12.0, lon: 55.0 },
  { re: /mediterranean|aegean|libya|gaza/i,                    th: "ทะเลเมดิเตอร์เรเนียน",       en: "Mediterranean Sea",       lat: 34.0, lon: 18.0 },
  { re: /caribbean|venezuela|panama canal/i,                   th: "ทะเลแคริบเบียน",            en: "Caribbean Sea",           lat: 14.0, lon: -72.0 },
  { re: /indian ocean/i,                                       th: "มหาสมุทรอินเดีย",           en: "Indian Ocean",            lat: 5.0,  lon: 75.0 },
];

// รับข้อความหลายชิ้น (หัวข้อ/สรุป ไทย+อังกฤษ) → {lat, lon, th, en} หรือ null
function geocodeText() {
  const text = Array.prototype.slice.call(arguments).filter(Boolean).join("  ");
  for (let i = 0; i < MDA_GEO_REGIONS.length; i++) {
    const r = MDA_GEO_REGIONS[i];
    if (r.re.test(text)) return { lat: r.lat, lon: r.lon, th: r.th, en: r.en };
  }
  return null;
}

/* ============================================================
   ดึง "หมุดเรือ" จากข่าว — สแกนชื่อเรือ + ประเภท + พื้นที่ในข่าว
   แล้วปักตำแหน่งโดยประมาณบนแผนที่ (ทดแทนเรือ dummy เดิม)
   ============================================================ */
const VESSEL_NAME_RE = /\b(MV|MT|MSC|FV|SS|USS|HMS|RFA|FGS|HNLMS|JS|INS|PNS|KRI|BRP|CCG)\s+([A-Z][A-Za-z0-9'.’\-]+(?:\s+[A-Z0-9][A-Za-z0-9'.’\-]+){0,2})/;

const VESSEL_TYPE_HINTS = [
  { type: "dark",    re: /shadow fleet|ghost fleet|dark fleet|sanctioned (?:vessel|tanker|ship)|ais (?:gap|off|spoof)/i },
  { type: "navy",    re: /\b(?:uss|hms|rfa|fgs|warship|frigate|destroyer|corvette|cutter)\b|coast guard|navy|naval|patrol (?:vessel|ship|boat)/i },
  { type: "fishing", re: /fishing (?:vessel|boat|fleet)|trawler|\bfv\b|seiner|jigger|iuu/i },
  { type: "tanker",  re: /\btanker|\bmt\b|crude|vlcc|product carrier|lng carrier|lpg|oil (?:tanker|products)/i },
  { type: "cargo",   re: /container|bulk(?:er| carrier)|cargo ship|freighter|\bmv\b|ro-?ro|general cargo|box ship/i },
];

function _vesselType(text) {
  for (let i = 0; i < VESSEL_TYPE_HINTS.length; i++) {
    if (VESSEL_TYPE_HINTS[i].re.test(text)) return VESSEL_TYPE_HINTS[i].type;
  }
  return "cargo";
}

const VESSEL_MENTION_RE = /\b(vessel|ship|tanker|boat|carrier|bulker|bulk|trawler|warship|frigate|destroyer|fleet|fishing|cargo|container|naval|coast guard|skiff|dhow)\b/i;

// รับรายการข่าว → คืน array ของเรือที่ปักหมุดได้ (มีชื่อ/ประเภท/พิกัด)
function extractVesselsFromNews(newsArr) {
  const out = [];
  let idx = 0;
  (newsArr || []).forEach(n => {
    const en  = (n.raw && (n.raw.en || n.raw.th)) || "";
    const th  = (n.raw && n.raw.th) || "";
    const sum = (n.ai && (n.ai.en || n.ai.th)) || "";
    const sth = (n.ai && n.ai.th) || "";
    const hay = [en, sum, th, sth, n.outlet].join("  ");
    if (!VESSEL_MENTION_RE.test(hay)) return;          // ข่าวต้องพูดถึงเรือ
    const geo = geocodeText(en, th, sum, sth, n.outlet);
    if (!geo) return;                                   // ต้องระบุพื้นที่ได้
    const m = VESSEL_NAME_RE.exec(en) || VESSEL_NAME_RE.exec(sum);
    const name = m ? (m[1] + " " + m[2]).trim() : null;
    const type = _vesselType(hay);
    // กระจายตำแหน่งรอบจุดศูนย์กลางภูมิภาค ไม่ให้หมุดทับกัน
    const ang = (idx * 47) % 360, r = 0.5 + (idx % 6) * 0.45;
    idx++;
    out.push({
      id:     "nv_" + (n.id || idx),
      name:   name || (type === "navy" ? "Naval unit" : "Vessel") + " · " + geo.en,
      flag:   "??",
      type:   type,
      course: 0, sp: 0,
      lat:    geo.lat + r * Math.cos(ang * Math.PI / 180),
      lon:    geo.lon + r * Math.sin(ang * Math.PI / 180),
      status: "watch",
      fromNews: true,
      url:    n.url,
      region: geo,
      note:   { th: th || en, en: en || th },
    });
  });
  return out;
}

/* ---- row (DB) <-> object (UI) ---- */
function eventRowToObj(r) {
  const t = r.published_at || r.created_at;
  const timeStr = t
    ? new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const ago = {
    th: window.mdaTimeAgo ? window.mdaTimeAgo(t, "th") : "",
    en: window.mdaTimeAgo ? window.mdaTimeAgo(t, "en") : "",
  };
  return {
    id:      r.id,
    sev:     r.sev || "medium",
    cat:     r.cat || "MARITIME",
    srcKey:  r.src_key || null,
    time:    timeStr,
    ago,
    region:  { th: r.region_th || r.region_en || "", en: r.region_en || r.region_th || "" },
    area:    { th: r.area_th   || r.area_en   || "", en: r.area_en   || r.area_th   || "" },
    title:   { th: r.title_th  || r.title_en  || "", en: r.title_en  || r.title_th  || "" },
    summary: { th: r.summary_th|| r.summary_en|| "", en: r.summary_en|| r.summary_th|| "" },
    lat:     r.lat,
    lon:     r.lon,
    vessel:  r.vessel || null,
    conf:    r.conf || 3,
    tags:    r.tags || [],
    source:  { outlet: r.source_outlet || "", url: r.source_url || "" },
    resolved: !!r.resolved,
    origin:  r.origin || "manual",
    publishedAt: t,
  };
}

function eventObjToRow(o) {
  const dif = (a, b) => (a && a !== b ? a : null);
  return {
    id:            o.id,
    sev:           o.sev,
    cat:           o.cat,
    src_key:       o.srcKey || null,
    title_en:      o.title.en,
    title_th:      dif(o.title.th, o.title.en),
    area_en:       o.area.en,
    area_th:       dif(o.area.th, o.area.en),
    region_en:     o.region.en,
    region_th:     dif(o.region.th, o.region.en),
    summary_en:    o.summary.en,
    summary_th:    dif(o.summary.th, o.summary.en),
    lat:           o.lat,
    lon:           o.lon,
    vessel:        o.vessel || null,
    conf:          o.conf || 3,
    tags:          o.tags || [],
    source_outlet: o.source.outlet || null,
    source_url:    o.source.url || null,
    resolved:      !!o.resolved,
    origin:        o.origin || "manual",
    published_at:  o.publishedAt || new Date().toISOString(),
  };
}

/* ---- Supabase read / write ---- */
async function loadEventsFromSupabase() {
  const SB = window.MDA_SB;
  if (!SB) return [];
  try {
    const { data, error } = await SB
      .from("events").select("*")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) { console.warn("[MDA] events read", error.message); return []; }
    return (data || []).map(eventRowToObj);
  } catch (e) {
    console.warn("[MDA] events read failed", e);
    return [];
  }
}

async function addEventToSupabase(obj) {
  const SB = window.MDA_SB;
  if (!SB) return { error: "no_supabase" };
  try {
    const { error } = await SB.from("events").insert(eventObjToRow(obj));
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
}

/* ---- localStorage cache (offline fallback) ---- */
function loadEventsCache() {
  try { const r = localStorage.getItem(EVENTS_CACHE_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function saveEventsCache(items) {
  try { localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(items)); } catch {}
}

/* ---- React hook ---- */
function useEventsUpdater() {
  const [events, setEvents]   = React.useState(loadEventsCache);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const rows = await loadEventsFromSupabase();
    if (window.MDA_SB) { saveEventsCache(rows); setEvents(rows); }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    reload();
    const id = setInterval(reload, EVENTS_REFRESH_MS);
    return () => clearInterval(id);
  }, [reload]);

  // เพิ่มเหตุการณ์: แสดงทันที (optimistic) แล้วพยายามบันทึกลง Supabase
  const addEvent = React.useCallback(async (obj) => {
    setEvents(prev => [obj, ...prev.filter(e => e.id !== obj.id)]);
    const res = await addEventToSupabase(obj);
    if (res.ok) reload();
    return res;
  }, [reload]);

  return { events, loading, reload, addEvent };
}

/* ============================================================
   ฟอร์มเพิ่มเหตุการณ์ (modal) + ปุ่มเรียก
   ============================================================ */
function AddEventModal({ open, onClose, lang, addEvent, showToast }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const [f, setF] = React.useState({
    title: "", sev: "high", cat: "TERROR", regionKey: "redsea",
    lat: 13.5, lon: 43.3, summary: "", source: "", tags: "",
  });
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;

  const domains = window.MDA_THREAT_DOMAINS || [];
  const onRegion = (key) => {
    const p = REGION_PRESETS.find(r => r.key === key) || REGION_PRESETS[0];
    setF(s => ({ ...s, regionKey: key, lat: p.lat, lon: p.lon }));
  };
  const inputStyle = {
    background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 6,
    padding: "7px 9px", color: "var(--text)", fontFamily: "var(--font-ui)",
    fontSize: "var(--fs-sm)", outline: "none", width: "100%",
  };
  const label = (s) => <div className="dim up" style={{ fontSize: 9, marginBottom: 4 }}>{s}</div>;

  const submit = async () => {
    if (!f.title.trim()) { if (showToast) showToast(T("กรุณาใส่หัวข้อเหตุการณ์", "Please enter a title"), "warn"); return; }
    const region = REGION_PRESETS.find(r => r.key === f.regionKey) || REGION_PRESETS[0];
    const dom = domains.find(d => d.key === f.cat);
    const now = new Date().toISOString();
    const obj = {
      id: "evt_man_" + Date.now(),
      sev: f.sev,
      cat: dom ? dom.en.toUpperCase() : "MARITIME",
      srcKey: null,
      time: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      ago: { th: "เมื่อกี้", en: "just now" },
      region: f.regionKey === "custom"
        ? { th: T("กำหนดเอง", "Custom"), en: "Custom" }
        : { th: region.th, en: region.en },
      area:   f.regionKey === "custom"
        ? { th: T("กำหนดเอง", "Custom"), en: "Custom" }
        : { th: region.th, en: region.en },
      title:   { th: f.title.trim(), en: f.title.trim() },
      summary: { th: f.summary.trim(), en: f.summary.trim() },
      lat: parseFloat(f.lat) || 0,
      lon: parseFloat(f.lon) || 0,
      vessel: null,
      conf: 3,
      tags: f.tags.split(",").map(t => t.trim()).filter(Boolean),
      source: { outlet: T("เพิ่มโดยเจ้าหน้าที่", "Operator entry"), url: f.source.trim() },
      resolved: false,
      origin: "manual",
      publishedAt: now,
    };
    setBusy(true);
    const res = await addEvent(obj);
    setBusy(false);
    onClose();
    if (res && res.ok) {
      if (showToast) showToast(T("บันทึกเหตุการณ์ลงฐานข้อมูลแล้ว", "Event saved to database"), "ok");
    } else {
      if (showToast) showToast(
        T("แสดงเหตุการณ์แล้ว (ยังไม่บันทึก DB — ต้อง login เพื่อบันทึกถาวร)",
          "Event shown (not saved to DB — log in to persist)"), "warn");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 460, maxWidth: "92vw", background: "var(--surface-2)",
        border: "1px solid var(--border-2)", borderRadius: 12, overflow: "hidden",
        boxShadow: "var(--shadow)" }} onClick={ev => ev.stopPropagation()}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)",
          fontWeight: 600, display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="alert" size={15} style={{ color: "var(--accent)" }} />
          {T("เพิ่มเหตุการณ์ใหม่", "Add New Event")}
        </div>

        <div style={{ padding: 16, maxHeight: "72vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            {label(T("หัวข้อเหตุการณ์", "Event title"))}
            <input style={inputStyle} value={f.title} autoFocus
              placeholder={T("เช่น เรือบรรทุกน้ำมันถูกโจมตีใกล้ฮอร์มุซ", "e.g. Tanker attacked near Hormuz")}
              onChange={e => setF(s => ({ ...s, title: e.target.value }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {label(T("ระดับความรุนแรง", "Severity"))}
              <select style={inputStyle} value={f.sev} onChange={e => setF(s => ({ ...s, sev: e.target.value }))}>
                <option value="critical">{T("วิกฤต", "Critical")}</option>
                <option value="high">{T("สูง", "High")}</option>
                <option value="medium">{T("ปานกลาง", "Medium")}</option>
                <option value="low">{T("ต่ำ", "Low")}</option>
              </select>
            </div>
            <div>
              {label(T("ภัยคุกคาม (ศรชล.)", "Threat domain"))}
              <select style={inputStyle} value={f.cat} onChange={e => setF(s => ({ ...s, cat: e.target.value }))}>
                {domains.map(d => <option key={d.key} value={d.key}>{T(d.th, d.en)}</option>)}
              </select>
            </div>
          </div>

          <div>
            {label(T("พื้นที่", "Area / Region"))}
            <select style={inputStyle} value={f.regionKey} onChange={e => onRegion(e.target.value)}>
              {REGION_PRESETS.map(r => <option key={r.key} value={r.key}>{T(r.th, r.en)}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {label(T("ละติจูด (lat)", "Latitude"))}
              <input style={inputStyle} type="number" step="0.1" value={f.lat}
                onChange={e => setF(s => ({ ...s, lat: e.target.value }))} />
            </div>
            <div>
              {label(T("ลองจิจูด (lon)", "Longitude"))}
              <input style={inputStyle} type="number" step="0.1" value={f.lon}
                onChange={e => setF(s => ({ ...s, lon: e.target.value }))} />
            </div>
          </div>

          <div>
            {label(T("สรุปเหตุการณ์", "Summary"))}
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={f.summary}
              placeholder={T("รายละเอียดโดยย่อ…", "Brief details…")}
              onChange={e => setF(s => ({ ...s, summary: e.target.value }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {label(T("แท็ก (คั่นด้วย ,)", "Tags (comma-sep)"))}
              <input style={inputStyle} value={f.tags}
                placeholder="Houthi, Hormuz"
                onChange={e => setF(s => ({ ...s, tags: e.target.value }))} />
            </div>
            <div>
              {label(T("ลิงก์แหล่งข่าว", "Source URL"))}
              <input style={inputStyle} value={f.source} placeholder="https://…"
                onChange={e => setF(s => ({ ...s, source: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{T("ยกเลิก", "Cancel")}</button>
          <button className="btn btn-primary btn-sm" disabled={busy}
            style={{ opacity: f.title.trim() && !busy ? 1 : 0.5 }} onClick={submit}>
            <Icon name="check" size={13} />{busy ? T("กำลังบันทึก…", "Saving…") : T("เพิ่มเหตุการณ์", "Add Event")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEventButton({ addEvent, lang, showToast, className }) {
  const [open, setOpen] = React.useState(false);
  const T = (th, en) => (lang === "th" ? th : en);
  return (
    <React.Fragment>
      <button className={className || "btn btn-primary btn-sm"} onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />{T("เพิ่มเหตุการณ์", "Add Event")}
      </button>
      <AddEventModal open={open} onClose={() => setOpen(false)} lang={lang}
        addEvent={addEvent} showToast={showToast} />
    </React.Fragment>
  );
}

Object.assign(window, {
  useEventsUpdater, addEventToSupabase, loadEventsFromSupabase,
  AddEventModal, AddEventButton, REGION_PRESETS,
  geocodeText, MDA_GEO_REGIONS, extractVesselsFromNews,
});
