/* ============================================================
   Shared components + icon set  → exported to window
   ============================================================ */
const { createContext, useContext, useState, useEffect, useRef, useMemo } = React;

/* ---- i18n helpers ---- */
const LangCtx = createContext("th");
function useLang() { return useContext(LangCtx); }
// tx({th,en}, lang) or tx("plain")
function tx(v, lang) {
  if (v == null) return "";
  if (typeof v === "object" && ("th" in v || "en" in v)) return v[lang] ?? v.th ?? v.en;
  return v;
}

/* ============================================================
   ICONS  (lucide-style, 24px stroke)
   ============================================================ */
const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  radar: '<path d="M19.07 4.93A10 10 0 1 0 22 12"/><path d="M12 12 19 5"/><path d="M12 12v-5"/><circle cx="12" cy="12" r="2"/><path d="M12 12 16 9"/>',
  feed: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  brief: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ship: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M12 10V2"/><path d="M8 6h8"/>',
  sat: '<path d="m13.5 6.5-3 3"/><path d="m17.5 10.5-3 3"/><path d="M3 21a6 6 0 0 0 6-6"/><path d="m7.5 16.5 3-3"/><rect x="11.4" y="2.6" width="5" height="5" rx="1" transform="rotate(45 13.9 5.1)"/><rect x="16.4" y="7.6" width="5" height="5" rx="1" transform="rotate(45 18.9 10.1)"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  spark: '<path d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  anchor: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V22"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  wave: '<path d="M2 8c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M2 14c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
};
function Icon({ name, size = 24, style, className, strokeWidth = 1.8 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }} />
  );
}

/* ============================================================
   SEVERITY helpers
   ============================================================ */
const SEV = {
  critical: { cls:"badge-crit", th:"วิกฤต", en:"CRITICAL", color:"var(--crit)" },
  high:     { cls:"badge-warn", th:"สูง", en:"HIGH", color:"var(--accent)" },
  medium:   { cls:"badge-info", th:"กลาง", en:"MEDIUM", color:"var(--info)" },
  low:      { cls:"badge-mute", th:"ต่ำ", en:"LOW", color:"var(--text-dim)" },
};
function SevBadge({ sev, lang }) {
  const s = SEV[sev] || SEV.low;
  return <span className={"badge " + s.cls}><span className="bdot"></span>{lang === "th" ? s.th : s.en}</span>;
}

/* ---- generic badge ---- */
function Badge({ kind = "mute", children, dot }) {
  return <span className={"badge badge-" + kind}>{dot && <span className="bdot"></span>}{children}</span>;
}

/* ---- source chip ---- */
function SrcChip({ srcKey, withName, lang }) {
  const src = window.MDA_DATA.sources[srcKey];
  if (!src) return null;
  const short = src.tag === "AIS" ? "AIS" : src.tag === "SAT" ? "SAT" : src.tag === "GOV" ? "GOV" :
    src.tag === "DATA" ? "DAT" : src.tag === "NEWS" ? "NEWS" : "SOC";
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="src-chip" style={{ background: src.color }}>{short.slice(0,3)}</span>
      {withName && <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>{src.name}</span>}
    </span>
  );
}

/* ============================================================
   Sparkline
   ============================================================ */
function Sparkline({ data, w = 64, h = 22, color = "var(--accent)", fill = true }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((d, i) => [ (i / (data.length - 1)) * w, h - ((d - min) / rng) * (h - 3) - 1.5 ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${w} ${h} L0 ${h} Z`;
  const gid = "sg" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.35" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color} />
    </svg>
  );
}

/* ---- bar mini chart ---- */
function MiniBars({ data, w = 70, h = 24, color = "var(--accent)" }) {
  const max = Math.max(...data) || 1;
  const bw = w / data.length;
  return (
    <svg width={w} height={h} style={{ display:"block" }}>
      {data.map((d, i) => {
        const bh = Math.max(2, (d / max) * (h - 2));
        return <rect key={i} x={i * bw + 0.5} y={h - bh} width={bw - 1.5} height={bh} rx="1"
          fill={color} opacity={i === data.length - 1 ? 1 : 0.45} />;
      })}
    </svg>
  );
}

/* ============================================================
   Threat meter
   ============================================================ */
function ThreatMeter({ value, lang }) { // value 0..100
  const color = value >= 75 ? "var(--crit)" : value >= 45 ? "var(--accent)" : "var(--ok)";
  return (
    <div className="meter">
      <div className="meter-track">
        <div className="meter-fill" style={{ width: value + "%", background: color, boxShadow: `0 0 10px ${color}` }}></div>
      </div>
      <div className="meter-scale">
        <span>{lang === "th" ? "ต่ำ" : "LOW"}</span>
        <span>{lang === "th" ? "เฝ้าระวัง" : "GUARDED"}</span>
        <span>{lang === "th" ? "สูง" : "HIGH"}</span>
        <span>{lang === "th" ? "วิกฤต" : "CRIT"}</span>
      </div>
    </div>
  );
}

/* confidence dots (1..5) */
function Confidence({ value, max = 5 }) {
  return (
    <span className="conf" title={`confidence ${value}/${max}`}>
      {Array.from({ length: max }).map((_, i) => <span key={i} className={"d" + (i < value ? " on" : "")}></span>)}
    </span>
  );
}

/* ---- donut gauge ---- */
function Gauge({ value, size = 96, label, color = "var(--accent)" }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{ filter: `drop-shadow(0 0 6px ${color})`, transition:"stroke-dashoffset .6s" }} />
      </svg>
      <div className="gv"><div className="n" style={{ color }}>{value}</div>{label && <div className="l">{label}</div>}</div>
    </div>
  );
}

/* ---- panel wrapper ---- */
function Panel({ title, icon, action, children, style, bodyClass = "", flush }) {
  return (
    <div className="panel" style={style}>
      {title && (
        <div className="panel-head">
          <h3>{icon && <span className="ico"><Icon name={icon} size={15} /></span>}{title}</h3>
          {action}
        </div>
      )}
      <div className={"panel-body " + (flush ? "flush " : "") + bodyClass} style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

/* ---- vessel type glyph color ---- */
const VTYPE = {
  cargo:   { color:"#7d99b5", label:{th:"เรือสินค้า",en:"Cargo"} },
  tanker:  { color:"#5fb0c9", label:{th:"เรือบรรทุกน้ำมัน",en:"Tanker"} },
  fishing: { color:"#46c976", label:{th:"เรือประมง",en:"Fishing"} },
  navy:    { color:"#e3b341", label:{th:"เรือรบ (มิตร)",en:"Navy (friendly)"} },
  dark:    { color:"#f6553f", label:{th:"เรือปิดสัญญาณ",en:"Dark / Unknown"} },
};

/* ============================================================
   Time-period scope — shared by OSINT feed + Map events list
   scope = { key: '24h'|'7d'|'30d'|'all'|'custom', from:'YYYY-MM-DD', to:'YYYY-MM-DD' }
   ============================================================ */
const TIME_PRESETS = [
  { key: "24h", th: "24 ชม.",  en: "24h" },
  { key: "7d",  th: "7 วัน",   en: "7d" },
  { key: "30d", th: "30 วัน",  en: "30d" },
  { key: "all", th: "ทั้งหมด", en: "All" },
];

// แปลง scope → ช่วงเวลา {since, until} (Date | null)
function timeWindow(scope) {
  const now = new Date();
  const back = (days) => new Date(now.getTime() - days * 86400000);
  switch (scope && scope.key) {
    case "24h": return { since: back(1),  until: null };
    case "7d":  return { since: back(7),  until: null };
    case "30d": return { since: back(30), until: null };
    case "custom": return {
      since: scope.from ? new Date(scope.from + "T00:00:00") : null,
      until: scope.to   ? new Date(scope.to   + "T23:59:59") : null,
    };
    default: return { since: null, until: null }; // all
  }
}

function inTimeWindow(iso, since, until) {
  if (!since && !until) return true;
  const t = iso ? new Date(iso).getTime() : NaN;
  if (isNaN(t)) return false;
  if (since && t < since.getTime()) return false;
  if (until && t > until.getTime()) return false;
  return true;
}

function TimeScopeBar({ scope, onChange, lang, loading, count }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const set = (patch) => onChange(Object.assign({ key: "all", from: "", to: "" }, scope, patch));
  const isCustom = scope.key === "custom";
  const dateStyle = {
    height: 26, padding: "0 7px", fontSize: 11, borderRadius: 6,
    background: "var(--surface-2)", border: "1px solid var(--border-2)",
    color: "var(--text)", fontFamily: "var(--font-mono)", colorScheme: "light dark",
  };
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Icon name="clock" size={14} style={{ color: "var(--text-dim)", flex: "none" }} />
      <div className="row" style={{ gap: 4 }}>
        {TIME_PRESETS.map(p => (
          <button key={p.key}
            className={"btn btn-sm " + (scope.key === p.key ? "btn-primary" : "btn-ghost")}
            style={{ padding: "3px 10px" }}
            onClick={() => set({ key: p.key })}>{T(p.th, p.en)}</button>
        ))}
        <button
          className={"btn btn-sm " + (isCustom ? "btn-primary" : "btn-ghost")}
          style={{ padding: "3px 10px" }}
          title={T("กำหนดช่วงเวลาเอง", "Custom date range")}
          onClick={() => set({ key: "custom" })}>
          {T("กำหนดเอง", "Custom")}
        </button>
      </div>
      {isCustom && (
        <div className="row" style={{ gap: 5, alignItems: "center" }}>
          <input type="date" value={scope.from || ""} max={scope.to || undefined}
            onChange={e => set({ key: "custom", from: e.target.value })} style={dateStyle} />
          <span className="dim" style={{ fontSize: 12 }}>–</span>
          <input type="date" value={scope.to || ""} min={scope.from || undefined}
            onChange={e => set({ key: "custom", to: e.target.value })} style={dateStyle} />
        </div>
      )}
      {loading && <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>
        <span className="flash"></span> {T("กำลังค้นคลังข้อมูล…", "Querying archive…")}</span>}
      {count != null && !loading && (
        <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>{count} {T("รายการ", "items")}</span>
      )}
    </div>
  );
}

/* ============================================================
   Focus countries — concentrate on Cambodia, Burma (Myanmar), Malaysia
   "prioritize but keep global": matching items float to the top,
   the rest of the world is still shown below.
   ============================================================ */
const FOCUS_COUNTRIES = [
  { key: "KH", th: "กัมพูชา", en: "Cambodia",
    rx: /cambodia|cambodian|khmer|sihanoukville|sihanouk|koh ?kong|kampong som|\bream\b|kampot|กัมพูชา|เขมร|สีหนุ|เกาะกง|เรียม|กัมปอต/i },
  { key: "MM", th: "เมียนมา (พม่า)", en: "Myanmar (Burma)",
    rx: /myanmar|burma|burmese|rakhine|arakan|sittwe|kyauk ?phyu|kyaukpyu|coco island|great coco|mergui|myeik|tanintharyi|yangon|naypyidaw|irrawaddy|rohingya|เมียนมา|พม่า|ยะไข่|มะริด|ย่างกุ้ง|โรฮิงญา|อิระวดี/i },
  { key: "MY", th: "มาเลเซีย", en: "Malaysia",
    rx: /malaysia|malaysian|\bmalacca\b|melaka|johor|sabah|sarawak|kota kinabalu|labuan|lumut|langkawi|penang|port klang|kuala lumpur|putrajaya|มาเลเซีย|มะละกา|ซาบาห์|ซาราวัก|ยะโฮร์|ปีนัง|กัวลาลัมเปอร์/i },
];
const FOCUS_RE = new RegExp(FOCUS_COUNTRIES.map(c => c.rx.source).join("|"), "i");

// คืนประเทศโฟกัสที่ข้อความนี้ตรง (null = ไม่ตรง)
function focusCountryOf(text) {
  if (!text) return null;
  for (const c of FOCUS_COUNTRIES) if (c.rx.test(text)) return c;
  return null;
}

// แยกรายการเป็น {focus, rest} โดยรักษาลำดับเดิมในแต่ละกลุ่ม
function focusPartition(list, hayFn, on) {
  if (!on) return { focus: [], rest: list };
  const focus = [], rest = [];
  for (const it of list) (FOCUS_RE.test(hayFn(it) || "") ? focus : rest).push(it);
  return { focus, rest };
}

// ปุ่มสลับ "เน้นเพื่อนบ้าน"
function FocusToggle({ on, onChange, lang }) {
  const T = (th, en) => (lang === "th" ? th : en);
  return (
    <button className={"btn btn-sm " + (on ? "btn-primary" : "btn-ghost")}
      onClick={() => onChange(!on)}
      title={T("ดันข่าว/เหตุการณ์ของกัมพูชา พม่า มาเลเซีย ขึ้นก่อน (ยังเห็นทั่วโลก)",
               "Float Cambodia / Myanmar / Malaysia to the top (global still shown)")}>
      <Icon name="pin" size={13} />{T("เน้นเพื่อนบ้าน", "Neighbors")}
    </button>
  );
}

// แถบหัวข้อกลุ่มในรายการ (เน้นเพื่อนบ้าน / อื่น ๆ)
function FocusGroupLabel({ kind, lang, count }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const isFocus = kind === "focus";
  return (
    <div style={{ padding: "7px 12px 4px", fontSize: 10, letterSpacing: "0.08em",
      textTransform: "uppercase", fontFamily: "var(--font-mono)",
      color: isFocus ? "var(--accent)" : "var(--text-mute)",
      display: "flex", alignItems: "center", gap: 7 }}>
      {isFocus && <Icon name="pin" size={11} style={{ color: "var(--accent)" }} />}
      {isFocus ? T("พื้นที่เน้น · เพื่อนบ้าน (เขมร · พม่า · มาเลย์)", "Focus · Neighbors (KH · MM · MY)")
               : T("อื่น ๆ ทั่วโลก", "Other · Global")}
      {count != null && <span style={{ marginLeft: "auto", color: "var(--text-mute)" }}>{count}</span>}
    </div>
  );
}

Object.assign(window, {
  LangCtx, useLang, tx, Icon, ICON_PATHS, SEV, SevBadge, Badge, SrcChip,
  Sparkline, MiniBars, ThreatMeter, Confidence, Gauge, Panel, VTYPE,
  TimeScopeBar, timeWindow, inTimeWindow,
  FOCUS_COUNTRIES, FOCUS_RE, focusCountryOf, focusPartition, FocusToggle, FocusGroupLabel,
});
