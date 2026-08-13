/* ============================================================
   MapView — Leaflet dark tile map, global shipping lanes + chokepoints
   ============================================================ */

const projX = (lon) => (lon + 180) / 360 * 1000;
const projY = (lat) => (90 - lat)  / 180 * 500;
const projPt = (lon, lat) => [projX(lon), projY(lat)];

/* แผนที่ฐานตามธีม — ธีมสว่างใช้ CARTO Voyager (สีสันสดใส) */
const CARTO = (style) => "https://{s}.basemaps.cartocdn.com/" + style + "/{z}/{x}/{y}{r}.png";
const TILE_BY_THEME = {
  dark:     CARTO("dark_all"),
  light:    CARTO("light_all"),
  daylight: CARTO("rastertiles/voyager"),
  ocean:    CARTO("rastertiles/voyager"),
  aurora:   CARTO("rastertiles/voyager"),
};
const tileForTheme = (theme) => TILE_BY_THEME[theme] || TILE_BY_THEME.dark;
const currentTheme = () => document.documentElement.getAttribute("data-theme") || "dark";

const MAP_STYLE = `
  @keyframes pulse-ring {
    0%   { transform: scale(0.4); opacity: 0.9; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  .leaflet-container { background: var(--map-bg, #050810) !important; font-family: var(--font-ui); }
  .leaflet-control-zoom a {
    background: var(--surface-2) !important;
    border-color: var(--border-2) !important;
    color: var(--text) !important;
    font-size: 16px !important;
    line-height: 28px !important;
  }
  .leaflet-control-zoom a:hover { background: var(--surface-3) !important; color: var(--accent) !important; }
  .leaflet-control-zoom { border: 1px solid var(--border-2) !important; border-radius: 7px !important; overflow: hidden; }
  .leaflet-bar { box-shadow: var(--shadow) !important; }
  .leaflet-control-scale-line {
    background: rgba(10,13,18,0.7) !important;
    border-color: var(--border-2) !important;
    color: var(--text-dim) !important;
    font-size: 10px !important;
    font-family: var(--font-mono) !important;
  }
  .mda-label {
    background: rgba(10,13,18,0.88);
    border: 1px solid rgba(var(--accent-rgb),0.35);
    border-radius: 4px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 6px;
    white-space: nowrap;
  }
  .mda-label::before { display: none !important; }

  /* ── ทูลทิปจุดข่าว ────────────────────────────────────────────────
     แยกจาก .mda-label เพราะคนละงานกัน — .mda-label เป็นป้ายชื่อเรือสั้น ๆ
     ฟอนต์ monospace 10px ซึ่งอ่านพาดหัวภาษาไทยยาว ๆ แทบไม่ออก
     อันนี้เป็นการ์ดข่าว: ฟอนต์ UI ปกติ ขนาดอ่านสบาย และเว้นบรรทัดจริง */
  .mda-news-tip {
    background: rgba(10,13,18,0.96) !important;
    border: 1px solid var(--border-2) !important;
    border-radius: 9px !important;
    padding: 0 !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5) !important;
    font-family: var(--font-ui) !important;
    white-space: normal !important;
    color: var(--text) !important;
    /* วางแนวนอน: พาดหัวจบใน 1-2 บรรทัด แทนการ์ดสูงแคบแบบเดิม
       ค่านี้เป็นเพดานเท่านั้น — ตัวจริงถูกบีบตามความกว้างแผงแผนที่
       ในตัวจัดการ tooltipopen เพราะ CSS มองไม่เห็นขนาดแผง */
    max-width: 560px !important;
    width: max-content !important;
  }
  .mda-news-tip::before { display: none !important; }
  /* แถวเดียว: ป้ายด้านภัยอยู่ซ้าย เนื้อหาอยู่ขวา */
  .mda-news-tip .nt-in    { display: flex; align-items: flex-start; gap: 10px;
                            padding: 9px 12px; border-left-width: 3px; border-left-style: solid; }
  .mda-news-tip .nt-dom   { flex: 0 0 auto; max-width: 118px;
                            font-size: 9.5px; font-weight: 700; letter-spacing: .04em;
                            line-height: 1.35; padding: 3px 7px; border-radius: 5px;
                            border: 1px solid currentColor; opacity: .95; }
  .mda-news-tip .nt-body  { min-width: 0; }   /* ให้ข้อความยาวหดได้ ไม่ดันการ์ดจนล้น */
  .mda-news-tip .nt-title { font-size: 13.5px; line-height: 1.45; color: var(--text); font-weight: 500; }
  .mda-news-tip .nt-meta  { font-size: 11px; color: var(--text-dim); margin-top: 5px;
                            display: flex; flex-wrap: wrap; gap: 3px 7px; align-items: center; }
  .mda-news-tip .nt-hint  { color: var(--text-mute); }
  /* รูปอยู่ท้ายแถว ขนาดคงที่ ไม่ยืดตามภาพต้นฉบับ · object-fit กันภาพบิด */
  .mda-news-tip .nt-img   { flex: 0 0 auto; width: 78px; height: 58px; border-radius: 6px;
                            object-fit: cover; background: var(--surface-3);
                            border: 1px solid var(--border-2); }
`;

/* ── Shipping lanes (approximate great-circle waypoints) ── */
const SHIPPING_LANES = [
  /* Trans-Atlantic: New York → Gibraltar → Rotterdam */
  { name: "Trans-Atlantic", pts: [[-74,40.7],[-40,42],[-20,44],[-5.4,35.9],[-9,38],[-2,51],[4.5,51.9]] },
  /* Trans-Pacific: Los Angeles → Hawaii → Japan */
  { name: "Trans-Pacific N", pts: [[-118,33.7],[-157,21],[-170,30],[-160,40],[-150,45],[140,35],[139.7,35.7]] },
  /* Trans-Pacific S: LA → Panama → Asia */
  { name: "Trans-Pacific S", pts: [[-118,33.7],[-100,18],[-79.9,9],[-80,9],[100,3],[103.8,1.3],[114,22.3]] },
  /* Indian Ocean main: Suez → Hormuz → Malacca */
  { name: "Indian Ocean", pts: [[32.5,29.9],[43.4,12.6],[55,12],[60,22],[56.3,26.6],[65,14],[72,7],[80,6],[90,5],[103.8,1.3]] },
  /* Cape of Good Hope: Europe → South Africa → Asia */
  { name: "Cape Route", pts: [[-9,38],[-8,35],[0,20],[10,0],[18.4,-33.9],[28,-35],[50,-20],[72,7],[80,6],[103.8,1.3]] },
  /* Mediterranean: Gibraltar → Suez */
  { name: "Mediterranean", pts: [[-5.4,35.9],[5,37],[12,37],[20,35],[25,35],[29,41],[32,40],[32.5,29.9]] },
  /* North Sea / Baltic */
  { name: "North Sea", pts: [[-9,51.5],[-4,54],[0,54],[4.5,51.9],[8,57],[10,57],[18,57],[25,60]] },
  /* China – Japan – Korea corridor */
  { name: "East Asia", pts: [[103.8,1.3],[110,20],[114,22.3],[121,31.2],[122,37],[126,33],[129,35],[135,34.7],[139.7,35.7]] },
  /* Australia route */
  { name: "Australia", pts: [[103.8,1.3],[112,-8],[115,-32],[115,-33.9],[130,-35],[151,-34],[174,-36.9]] },
];

/* ── ความสดของตำแหน่ง AIS ─────────────────────────────────────
   เรือที่แล่นอยู่ส่งตำแหน่งทุก 2-10 วินาที · เรือทอดสมอทุก ~3 นาที
   เงียบเกิน 10 นาทีจึงผิดปกติ (ดับ AIS หรือหลุดพื้นที่รับสัญญาณ)
   เซิร์ฟเวอร์เก็บหมุดไว้ถึง 30 นาที (STALE_SECONDS ใน ais.py) หมุดที่เห็น
   จึงอาจเก่ามากโดยที่หน้าจอเดิมไม่บอกเลย — เรือ 20 นอตเคลื่อนที่ได้
   ~18 กม. ใน 29 นาที การวาดตำแหน่งเก่าให้ดูเท่าตำแหน่งสดจึงทำให้เข้าใจผิด
   สองช่องทางสื่อสาร: ความทึบ = ความสด · วงประ = ขาดสัญญาณ            */
const AIS_FRESH_SEC = 180;
const AIS_LOST_SEC  = 600;

function ageOpacity(sec) {
  if (!(sec > AIS_FRESH_SEC)) return 1;
  if (sec >= AIS_LOST_SEC)    return 0.42;
  return 1 - ((sec - AIS_FRESH_SEC) / (AIS_LOST_SEC - AIS_FRESH_SEC)) * 0.58;
}

/* พาดหัวข่าวมาจาก RSS ของคนอื่น ไม่ใช่ข้อความที่เราคุมเอง
   ของเดิมยัดลง innerHTML ตรง ๆ — แท็กหรือเครื่องหมายคำพูดในพาดหัว
   ทำให้ทูลทิปเพี้ยนได้ และเปิดช่องให้ฉีดมาร์กอัปเข้ามา */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* แยกชิ้นส่วนของข่าวสำหรับแสดงผล — ใช้ร่วมกันระหว่างทูลทิปบนแผนที่
   กับฟีดข่าวด้านข้างในโหมดเต็มจอ ถ้าเขียนแยกกันสองที่ วันหนึ่งจะเพี้ยนคนละแบบ */
function newsCardParts(p, lang) {
  const th = lang !== "en";
  const title = (p.title && (th ? (p.title.th || p.title.en) : (p.title.en || p.title.th))) || "";
  const where = p.region ? (th ? p.region.th : p.region.en) : "";
  const dom   = p.domain ? (th ? p.domain.th : p.domain.en) : "";

  // ตรรกะแยกสำนักข่าวอยู่ที่ components.jsx — ใช้ร่วมกับหน้ารายละเอียดเหตุการณ์
  const split = window.splitGoogleNewsOutlet
    ? window.splitGoogleNewsOutlet(title, p.outlet)
    : { head: title, outlet: p.outlet || "" };
  const head = split.head, src = split.outlet;

  // "3 ชม.ที่แล้ว" อ่านง่ายกว่า 2026-08-10T18:39:16.000Z ที่ p.time เก็บไว้
  const ago = (p.item && p.item.ago && (th ? p.item.ago.th : p.item.ago.en))
    || (window.mdaTimeAgo ? window.mdaTimeAgo(p.time, lang) : "")
    || "";

  return { head, src, ago, dom, where };
}

function ageText(sec, th) {
  if (sec < 60) return th ? sec + " วินาทีที่แล้ว" : sec + "s ago";
  const m = Math.round(sec / 60);
  return th ? m + " นาทีที่แล้ว" : m + " min ago";
}

/* ข้อความ hover — เดิม tooltip บอกแค่ชื่อเรือ ทั้งที่ AIS ส่งความเร็ว เข็ม
   และอายุตำแหน่งมาให้ครบแล้ว */
function vesselTitle(v, th) {
  const vt = window.VTYPE[v.type] || window.VTYPE.unknown;
  const bits = [v.name || v.id, window.tx(vt.label, th ? "th" : "en")];
  if (typeof v.sp === "number" && !v.fromNews) {
    bits.push(v.sp.toFixed(1) + (th ? " นอต" : " kn"));
    if (v.sp > 0.5) bits.push((th ? "เข็ม " : "COG ") + Math.round(v.course || 0) + "°");
  }
  if (typeof v.ageSec === "number") {
    bits.push((th ? "อัปเดต " : "updated ") + ageText(v.ageSec, th));
    if (v.ageSec >= AIS_LOST_SEC) bits.push(th ? "⚠ ขาดสัญญาณ" : "⚠ signal lost");
  }
  // หมุดจากข่าวคือตำแหน่ง "โดยประมาณตามพื้นที่ที่ข่าวพูดถึง" ไม่ใช่การติดตามเรือจริง
  // ต้องบอกให้ชัด มิฉะนั้นดูแล้วแยกไม่ออกจากหมุด AIS
  if (v.fromNews) bits.push(th ? "ตำแหน่งโดยประมาณจากข่าว" : "approx. position from reporting");
  return bits.join(" · ");
}

function vesselHtml(v, isSelected, th) {
  const vt = window.VTYPE[v.type] || window.VTYPE.unknown;
  const col = vt.color;
  const age = typeof v.ageSec === "number" ? v.ageSec : null;
  const opacity = age === null ? 1 : ageOpacity(age);
  const lost = age !== null && age >= AIS_LOST_SEC;
  const isAlert = v.status === "critical" || v.status === "watch";
  const critCol = v.status === "critical" ? "#ff4444" : "#e3b341";
  const sz = 24;

  const ring = isAlert
    ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid ${critCol};animation:pulse-ring 2s linear infinite;pointer-events:none;"></div>`
    : "";
  const sel = isSelected
    ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:1.5px dashed ${col};pointer-events:none;"></div>`
    : "";

  /* สัญลักษณ์เรือแบบ VesselFinder (vesselfinder.com)
     - เรือที่มีข้อมูลเดินเรือ → ลูกศรหัวแหลมชี้ตามเข็ม ท้ายเรือเว้าเข้า
     - เรือจอด/ไม่มีข้อมูลความเร็ว-เข็ม → วงกลม (ตามธรรมเนียมของ VesselFinder)
     - สีตามประเภทเรือ AIS · เส้นขอบเทาบาง ๆ ให้เห็นชัดบนพื้นแผนที่ทุกโทน */
  const stroke = window.VTYPE_STROKE || "#999999";
  const isDark = v.type === "dark";
  /* ลูกศรใช้ได้เฉพาะเมื่อ "รู้เข็มจริง" เท่านั้น
     เรือที่สกัดจากข่าวมี course = 0 เพราะไม่มีข้อมูล ไม่ใช่เพราะมุ่งหน้าทิศเหนือ
     ของเดิมวาดเป็นลูกศรทั้งหมด แผนที่จึงแสดงกองเรือชี้ขึ้นเหนือพร้อมกันหมด
     ทั้งที่ไม่มีลำไหนรู้ทิศเลย — วงกลมคือสัญลักษณ์มาตรฐานของ "ไม่ทราบเข็ม"
     (ธรรมเนียมเดียวกับ VesselFinder) จึงใช้กับทั้งเรือจอดและเรือที่ไร้ข้อมูล */
  const hasAisNav = !v.fromNews && typeof v.sp === "number";
  const knowsHeading = hasAisNav && v.sp > 0.5;

  const paint = isDark
    // กองเรือเงา: ลำตัวโปร่ง เน้นว่าไม่มีข้อมูล AIS ยืนยัน
    ? `fill="none" stroke="${col}" stroke-width="1.7"`
    : `fill="${col}" stroke="${stroke}" stroke-width="1"`;

  const arrow = "M0,-10 L5.4,7.6 L0,3.9 L-5.4,7.6 Z";
  const shape = knowsHeading
    ? `<g transform="rotate(${v.course || 0})">
         <path d="${arrow}" ${paint} stroke-linejoin="round"/>
       </g>`
    : `<circle cx="0" cy="0" r="5.2" ${paint}/>`;

  /* วงประจาง ๆ = ตำแหน่งนี้เก่าเกิน 10 นาที อย่าใช้ตัดสินใจโดยไม่ยืนยันซ้ำ
     ใช้เส้นประคนละแบบกับวงเลือก (inset -5px) เพื่อไม่ให้สับสน */
  const staleRing = lost
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;border:1px dashed ${stroke};opacity:0.75;pointer-events:none;"></div>`
    : "";

  const title = vesselTitle(v, th).replace(/"/g, "&quot;");

  return `<div title="${title}" style="position:relative;width:${sz}px;height:${sz}px;opacity:${opacity.toFixed(2)};">
    ${ring}${sel}${staleRing}
    <svg width="${sz}" height="${sz}" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg"
         style="display:block;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.45));">
      ${shape}
    </svg>
  </div>`;
}

function eventHtml(sev) {
  const s = window.SEV[sev] || window.SEV.low;
  const c = s.color;
  return `<div style="position:relative;width:16px;height:16px;">
    <div style="position:absolute;inset:-5px;border-radius:50%;border:1.5px solid ${c};animation:pulse-ring 2.4s linear infinite;pointer-events:none;"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:${c};opacity:0.25;"></div>
    <div style="position:absolute;inset:4px;border-radius:50%;background:${c};box-shadow:0 0 6px ${c};"></div>
  </div>`;
}

/* จุดข่าว — วงเล็กกว่าจุดเหตุการณ์ ไม่มีวงกระเพื่อม เพื่อไม่ให้แย่งสายตา */
function newsHtml(color) {
  const c = color || "#5fb0c9";
  return `<div style="position:relative;width:11px;height:11px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:${c};opacity:0.22;"></div>
    <div style="position:absolute;inset:3px;border-radius:50%;background:${c};box-shadow:0 0 5px ${c};"></div>
  </div>`;
}

function focusHtml() {
  return `<div style="position:relative;width:22px;height:22px;">
    <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid var(--accent);animation:pulse-ring 1.8s linear infinite;pointer-events:none;"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:var(--accent);opacity:0.25;"></div>
    <div style="position:absolute;inset:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);"></div>
  </div>`;
}

function MapView({
  vessels = [], events = [], newsPoints = [], selected, onSelect, onSelectEvent, onSelectNews, lang,
  showLabels = false, showTracks = true, showEvents = true, showNews = true, sweep = false,
  showLanes = true, focus = null, view = null, lockBounds = null,
  zoomable = false, initialCenter = [20, 10], initialZoom = 2,
}) {
  const containerRef = React.useRef(null);
  const mapRef       = React.useRef(null);
  const tileRef      = React.useRef(null);
  const layersRef    = React.useRef({
    vessels: null, events: null, tracks: null, lanes: null, news: null,
  });

  /* ── init map ──────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

    const map = L.map(containerRef.current, {
      center:               initialCenter,
      zoom:                 initialZoom,
      minZoom:              2,
      maxZoom:              18,
      zoomControl:          false,
      scrollWheelZoom:      false,   // เขียนเอง — ดูตัวจัดการ wheel ด้านล่าง
      dragging:             zoomable,
      touchZoom:            zoomable,
      doubleClickZoom:      zoomable,
      boxZoom:              zoomable,
      keyboard:             zoomable,
      attributionControl:   false,
      maxBounds:            WORLD_BOUNDS,
      maxBoundsViscosity:   1.0,

      /* ── ความลื่นของการซูม ──────────────────────────────────────
         zoomSnap 0 = ไม่ปัดระดับเลย แผนที่หยุดที่ 6.37 ได้ ทำให้การซูม
         ด้วยล้อ/แทร็กแพดไหลต่อเนื่องจริง (ดูตัวจัดการ wheel ด้านล่าง)
         scrollWheelZoom ปิดไว้เพราะเราเขียนเอง — ของ Leaflet ทำงานแบบ
         สะสม → หน่วง → เล่นอนิเมชัน จึงกระโดดตามหลังมือเสมอ            */
      zoomSnap:             0,
      zoomDelta:            1,
      zoomAnimation:        true,
      zoomAnimationThreshold: 6,   // ปริยาย 4 — ให้การกระโดดไกลยังมีอนิเมชัน
      fadeAnimation:        true,
    });

    /* basemap ตามธีมปัจจุบัน (สลับได้ภายหลังด้วย setUrl) */
    tileRef.current = L.tileLayer(
      tileForTheme(currentTheme()),
      { subdomains: "abcd", maxZoom: 19, detectRetina: true }
    ).addTo(map);

    if (zoomable) {
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    }

    const lanes  = L.layerGroup().addTo(map);
    const tl     = L.layerGroup().addTo(map);
    const nl     = L.layerGroup().addTo(map);   // จุดข่าว (อยู่ใต้เหตุการณ์/เรือ)
    const el     = L.layerGroup().addTo(map);
    const vl     = L.layerGroup().addTo(map);
    layersRef.current = { vessels: vl, events: el, tracks: tl, lanes, news: nl };
    mapRef.current = map;

    /* ── ซูมล้อเมาส์ / แทร็กแพด แบบต่อเนื่อง ──────────────────────
       ขยับระดับซูมทันทีทุกเหตุการณ์ wheel โดยไม่ใส่อนิเมชันและไม่หน่วง
       ซูมจึงเกาะติดการเลื่อนนิ้วแบบ 1:1 แทนที่จะกระโดดตามหลัง
       (ต้องคู่กับ zoomSnap 0 ด้านบน มิฉะนั้นค่าจะถูกปัดทิ้ง)

       ยึดจุดใต้เคอร์เซอร์ไว้กับที่ด้วย setZoomAround — พฤติกรรมเดียวกับ
       แผนที่ทั่วไป คือซูมเข้าหาสิ่งที่กำลังชี้อยู่ ไม่ใช่กลางจอ            */
    const WHEEL_PX_PER_LEVEL = 250;   // ยิ่งมาก = ต้องเลื่อนมากขึ้นต่อ 1 ระดับ
    const onWheel = (e) => {
      e.preventDefault();
      // deltaMode 1 = นับเป็นบรรทัด (Firefox/เมาส์บางรุ่น) · 0 = พิกเซล
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const now = map.getZoom();
      const next = Math.max(map.getMinZoom(),
                   Math.min(map.getMaxZoom(), now - px / WHEEL_PX_PER_LEVEL));
      if (Math.abs(next - now) < 1e-4) return;
      map.setZoomAround(map.mouseEventToContainerPoint(e), next, { animate: false });
    };
    const wheelEl = containerRef.current;
    if (zoomable) wheelEl.addEventListener("wheel", onWheel, { passive: false });

    /* ปุ่ม +/- ควรจอดที่ระดับเต็มเสมอ แม้ล้อจะพาไปค้างที่ 6.37 —
       ระดับเต็มคือจุดที่ไทล์คมที่สุด ผู้ใช้จึงต้องมีทางกลับไปหาได้
       zoomSnap 0 ปิดการปัดของ Leaflet ไปแล้ว จึงต้องปัดเองตรงนี้
       (คีย์บอร์ดกับดับเบิลคลิกเรียก setZoom ตรง ๆ ไม่ผ่านทางนี้)        */
    map.zoomIn  = (d, o) => map.setZoom(Math.floor(map.getZoom() + 1e-6) + (d || 1), o);
    map.zoomOut = (d, o) => map.setZoom(Math.ceil(map.getZoom() - 1e-6) - (d || 1), o);

    setTimeout(() => {
      map.invalidateSize();
      if (zoomable) map.fitWorld({ animate: false });
    }, 150);

    return () => {
      // ผูก listener ไว้เองกับ container จึงต้องถอดเอง — map.remove() ไม่ถอดให้
      if (zoomable) wheelEl.removeEventListener("wheel", onWheel);
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      layersRef.current = { vessels: null, events: null, tracks: null, lanes: null, news: null };
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── สลับ basemap เมื่อเปลี่ยนธีม (data-theme) ───────────────── */
  React.useEffect(() => {
    const el = document.documentElement;
    const apply = () => {
      if (tileRef.current) tileRef.current.setUrl(tileForTheme(currentTheme()));
    };
    const obs = new MutationObserver(apply);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  /* ── resize observer ──────────────────────────────────────── */
  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── shipping lanes ───────────────────────────────────────── */
  React.useEffect(() => {
    const { lanes } = layersRef.current;
    if (!lanes) return;
    lanes.clearLayers();
    if (!showLanes) return;

    SHIPPING_LANES.forEach(lane => {
      const latlngs = lane.pts.map(([lon, lat]) => [lat, lon]);
      L.polyline(latlngs, {
        color: "rgba(80,140,200,0.22)",
        weight: zoomable ? 1.8 : 1.2,
        dashArray: "6 10",
      }).addTo(lanes);
    });
  }, [showLanes, zoomable]);

  /* ── vessels + tracks ─────────────────────────────────────── */
  React.useEffect(() => {
    const { vessels: vl, tracks: tl } = layersRef.current;
    if (!vl || !tl) return;
    vl.clearLayers();
    tl.clearLayers();

    const th = lang !== "en";

    vessels.forEach(v => {
      const isSelected = selected && selected.id === v.id;
      const icon = L.divIcon({
        html:      vesselHtml(v, isSelected, th),
        className: "",
        iconSize:  [24, 24],
        iconAnchor:[12, 12],
      });

      const marker = L.marker([v.lat, v.lon], { icon, zIndexOffset: isSelected ? 500 : 0 });
      marker.on("click", (ev) => { L.DomEvent.stopPropagation(ev); onSelect && onSelect(v); });

      if (showLabels) {
        // ป้ายถาวรบอกความเก่าด้วย มิฉะนั้นเปิดโหมดป้ายแล้วยังไม่รู้ว่าหมุดไหนค้าง
        const stale = typeof v.ageSec === "number" && v.ageSec >= AIS_LOST_SEC;
        marker.bindTooltip(
          (v.name || v.id) + (stale ? (th ? " · ค้าง " : " · stale ") + ageText(v.ageSec, th) : ""),
          { permanent: true, direction: "right", offset: [10, 0], className: "mda-label" }
        );
      }

      vl.addLayer(marker);

      if (showTracks && v.sp > 0) {
        const rad = (v.course - 90) * Math.PI / 180;
        const dist = 0.18 + v.sp * 0.012;
        const vt = window.VTYPE[v.type] || window.VTYPE.unknown;
        // เส้นทำนายทิศจางลงตามอายุตำแหน่งเช่นเดียวกับหมุด — ตำแหน่งเก่า
        // ยิ่งทำนายไม่ได้ ยิ่งไม่ควรวาดให้ดูมั่นใจ
        const fade = typeof v.ageSec === "number" ? ageOpacity(v.ageSec) : 1;
        L.polyline(
          [[v.lat, v.lon], [v.lat + Math.sin(rad) * dist, v.lon + Math.cos(rad) * dist]],
          { color: vt.color, weight: 1.5, opacity: 0.55 * fade, dashArray: "4 6" }
        ).addTo(tl);
      }
    });
  }, [vessels, selected, showLabels, showTracks, lang]);

  /* ── events ───────────────────────────────────────────────── */
  React.useEffect(() => {
    const { events: el } = layersRef.current;
    if (!el) return;
    el.clearLayers();
    if (!showEvents) return;

    events.forEach(e => {
      const icon = L.divIcon({
        html: eventHtml(e.sev), className: "", iconSize: [16, 16], iconAnchor: [8, 8],
      });
      L.marker([e.lat, e.lon], { icon })
        .on("click", (ev) => { L.DomEvent.stopPropagation(ev); onSelectEvent && onSelectEvent(e); })
        .addTo(el);
    });
  }, [events, showEvents]);

  /* ── จุดข่าว: ปักทุกข่าวที่ระบุพื้นที่ได้ ───────────────────── */
  React.useEffect(() => {
    const { news: nl } = layersRef.current;
    if (!nl) return;
    nl.clearLayers();
    if (!showNews) return;

    newsPoints.forEach(p => {
      const icon = L.divIcon({
        html: newsHtml(p.color), className: "", iconSize: [11, 11], iconAnchor: [5.5, 5.5],
      });
      const th = lang !== "en";
      const { head, src, ago, dom, where } = newsCardParts(p, lang);

      const meta = [where, src, ago].filter(Boolean)
        .map(x => `<span>${esc(x)}</span>`).join('<span style="opacity:.4">·</span>');

      L.marker([p.lat, p.lon], { icon })
        .bindTooltip(
          /* รูปประกอบ (ถ้าฟีดส่งมา) วางท้ายการ์ด — หลายฟีดไม่มีรูป
             onerror ซ่อนตัวเองเมื่อลิงก์เสีย จะได้ไม่เหลือกรอบว่างค้างไว้ */
          `<div class="nt-in" style="border-left-color:${p.color}">
             ${dom ? `<div class="nt-dom" style="color:${p.color}">${esc(dom)}</div>` : ""}
             <div class="nt-body">
               <div class="nt-title">${esc(head)}</div>
               <div class="nt-meta">${meta}<span style="opacity:.4">·</span><span class="nt-hint">${
                 th ? "คลิกเพื่อเปิด" : "click to open"}</span></div>
             </div>
             ${p.image ? `<img class="nt-img" src="${esc(p.image)}" alt="" loading="eager"
                              referrerpolicy="no-referrer"
                              onerror="this.style.display='none'">` : ""}
           </div>`,
          { direction: "top", offset: [0, -8], className: "mda-news-tip", sticky: false }
        )
        /* Leaflet วางทูลทิปกึ่งกลางหมุดแล้วจบ ไม่ดันกลับเมื่อชนขอบแผนที่
           การ์ดแนวนอนกว้างกว่าเดิมมาก หมุดที่อยู่ริมขวาจึงถูกตัดหายไปครึ่งใบ
           วัดหลังเปิดแล้วเลื่อนด้วย marginLeft (กำหนดค่าใหม่ทุกครั้ง
           ไม่บวกทับ transform ของ Leaflet เพื่อไม่ให้ค่าสะสม) */
        .on("tooltipopen", (ev) => {
          const map = mapRef.current;
          const el = ev.tooltip && ev.tooltip.getElement();
          if (!map || !el) return;
          const pad = 8;
          const mb = map.getContainer().getBoundingClientRect();

          /* ตัวจำกัดความกว้างจริงคือ "แผงแผนที่" ไม่ใช่ขนาดจอ — บนเลย์เอาต์
             1fr + คอลัมน์ขวา 330px แผนที่อาจกว้างแค่ ~360px ขณะที่ 70vw
             คำนวณได้ 574px การ์ดจึงกว้างกว่าตัวแผนที่ทั้งอันและยัดไม่ลง
             CSS มองไม่เห็นความกว้างนี้ ต้องกำหนดตอนเปิดทูลทิป */
          // ต้องใส่ !important ด้วย ไม่งั้นแพ้กฎ max-width ใน CSS ที่ประกาศ !important ไว้
          const cap = Math.max(200, Math.min(560, mb.width - pad * 2));
          el.style.setProperty("max-width", cap + "px", "important");

          /* รูปกินความกว้าง 78px ถ้าการ์ดแคบอยู่แล้วข้อความจะเหลือนิดเดียว
             แล้วพาดหัวตัดจนการ์ดสูงกว่ากว้าง — ผิดวัตถุประสงค์ของแนวนอน
             แผนที่แคบ (เช่นแผงข้างที่ ~340px) จึงตัดรูปออก เอาข้อความไว้ก่อน */
          const img = el.querySelector(".nt-img");
          if (img) img.style.display = cap < 420 ? "none" : "";

          // แล้วค่อยดันกลับถ้ายังชนขอบ (กำหนดค่าใหม่ทุกครั้ง ไม่บวกทับ)
          el.style.marginLeft = "0px";
          const tb = el.getBoundingClientRect();
          let dx = 0;
          if (tb.right > mb.right - pad) dx = (mb.right - pad) - tb.right;
          if (tb.left + dx < mb.left + pad) dx = (mb.left + pad) - tb.left;
          if (dx) el.style.marginLeft = Math.round(dx) + "px";
        })
        .on("click", (ev) => { L.DomEvent.stopPropagation(ev); onSelectNews && onSelectNews(p); })
        .addTo(nl);
    });
  }, [newsPoints, showNews, lang]);

  /* ── focus: บินไปจุดที่ส่งมาจากฟีดข่าว + ปักหมุดเด่น ──────────── */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || typeof focus.lat !== "number") return;
    const icon = L.divIcon({ html: focusHtml(), className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
    const m = L.marker([focus.lat, focus.lon], { icon, zIndexOffset: 1000 }).addTo(map);
    if (focus.label || focus.title) {
      m.bindPopup(
        '<div style="font-weight:600;margin-bottom:2px">' + (focus.label || "") + "</div>" +
        '<div style="font-size:11px;opacity:0.8">' + (focus.title || "") + "</div>"
      ).openPopup();
    }
    const t = setTimeout(() => map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 5), { duration: 1.2 }), 250);
    return () => { clearTimeout(t); map.removeLayer(m); };
  }, [focus]);

  /* ── view: บินไปพื้นที่ทางทะเลที่เลือกจากเมนู (ไม่ปักหมุด) ───── */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !view || typeof view.lat !== "number") return;
    // ผู้เรียกกำหนดความเร็วได้ — โหมดเน้นข่าวไทยอยากได้จังหวะช้ากว่าปกติ
    map.flyTo([view.lat, view.lon], view.zoom || 5,
      { duration: typeof view.duration === "number" ? view.duration : 1.1 });
  }, [view]);

  /* ── ล็อกแผนที่ไว้ในกรอบที่กำหนด ───────────────────────────────
     ใช้ตอนเน้นข่าวไทย: เลื่อน/ซูมออกนอกภูมิภาคไม่ได้ กันหลุดไปดูทั้งโลก
     ทั้งที่กำลังกรองเหลือแต่ข่าวไทย — มุมมองกับข้อมูลจะได้ตรงกัน

     ตั้ง minZoom ตามกรอบด้วย มิฉะนั้นจะซูมออกจนเห็นทั้งโลกได้
     แล้ว maxBounds จะเด้งกลับไปมาแทนที่จะกันไว้เฉย ๆ                */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!lockBounds) {
      map.setMinZoom(2);
      map.setMaxBounds(L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180)));
      return;
    }

    const b = L.latLngBounds(
      L.latLng(lockBounds[0][0], lockBounds[0][1]),
      L.latLng(lockBounds[1][0], lockBounds[1][1]));
    // เผื่อขอบรอบกรอบไว้เล็กน้อย ไม่ให้หมุดริมสุดชนขอบจนเลื่อนดูไม่ได้
    map.setMaxBounds(b.pad(0.12));
    const fit = map.getBoundsZoom(b);
    map.setMinZoom(Math.max(2, fit - 1));
  }, [lockBounds]);

  return (
    <div className="map-wrap" style={{ position: "relative", height: "100%", width: "100%" }}>
      <style>{MAP_STYLE}</style>
      <div ref={containerRef} style={{ height: "100%", width: "100%", minHeight: 220 }} />

      {sweep && (
        <div style={{
          position: "absolute", inset: 0,
          pointerEvents: "none", zIndex: 450, overflow: "hidden", borderRadius: "inherit",
        }}>
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            width: "300vmax", height: "300vmax",
            marginLeft: "-150vmax", marginTop: "-150vmax",
            background: "conic-gradient(from 0deg, transparent 330deg, rgba(var(--accent-rgb),0.10) 360deg)",
            animation: "sweep 9s linear infinite",
            transformOrigin: "center",
          }} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  MapView, projPt, projX, projY, SHIPPING_LANES,
  // เกณฑ์ความสดของตำแหน่ง — หน้าอื่น (legend, แผงรายละเอียดเรือ) ต้องใช้ค่าเดียวกัน
  AIS_FRESH_SEC, AIS_LOST_SEC, ageOpacity, ageText,
  newsCardParts,   // ฟีดข่าวในโหมดเต็มจอใช้ตัวเดียวกับทูลทิป
});
