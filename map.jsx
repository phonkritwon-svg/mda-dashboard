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

function vesselHtml(v, isSelected) {
  const vt = window.VTYPE[v.type] || window.VTYPE.cargo;
  const col = vt.color;
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
  // วงกลม = มีข้อมูล AIS จริงและเรือหยุดนิ่ง (จอด/ทอดสมอ)
  // เรือที่มาจากข่าวยังไม่มีค่าความเร็ว-เข็มจาก AIS → คงรูปลูกศรเรือไว้
  const hasAisNav = !v.fromNews && typeof v.sp === "number";
  const moored    = hasAisNav && v.sp <= 0.5;

  const paint = isDark
    // เรือปิดสัญญาณ: ลำตัวโปร่ง เน้นว่าไม่มีข้อมูล AIS ยืนยัน
    ? `fill="none" stroke="${col}" stroke-width="1.7"`
    : `fill="${col}" stroke="${stroke}" stroke-width="1"`;

  const arrow = "M0,-10 L5.4,7.6 L0,3.9 L-5.4,7.6 Z";
  const shape = moored
    ? `<circle cx="0" cy="0" r="5.2" ${paint}/>`
    : `<g transform="rotate(${v.course || 0})">
         <path d="${arrow}" ${paint} stroke-linejoin="round"/>
       </g>`;

  return `<div style="position:relative;width:${sz}px;height:${sz}px;">
    ${ring}${sel}
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
  showLanes = true, focus = null, view = null,
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
      scrollWheelZoom:      zoomable,
      dragging:             zoomable,
      touchZoom:            zoomable,
      doubleClickZoom:      zoomable,
      boxZoom:              zoomable,
      keyboard:             zoomable,
      attributionControl:   false,
      maxBounds:            WORLD_BOUNDS,
      maxBoundsViscosity:   1.0,

      /* ── ความลื่นของการซูม ──────────────────────────────────────
         ค่าปริยายของ Leaflet คือ zoomSnap:1 — ล้อเมาส์ขยับนิดเดียวก็
         กระโดดเต็ม 1 ระดับ (มาตราส่วนเปลี่ยนเท่าตัว) จึงรู้สึกกระตุก
         zoomSnap 0.25 ให้หยุดได้ที่ระดับเศษส่วน การหมุนล้อจึงไล่ไปทีละ
         ขั้นละเอียด ส่วน zoomDelta คงไว้ที่ 1 เพื่อให้ปุ่ม +/- และคีย์บอร์ด
         ยังขยับเต็มระดับตามที่ผู้ใช้คาด
         wheelPxPerZoomLevel สูงขึ้น = ต้องหมุนล้อมากขึ้นต่อ 1 ระดับ
         (ค่าปริยาย 60 ไวเกินไปกับ trackpad) · debounce ต่ำลงให้ตอบสนองไว */
      zoomSnap:             0.25,
      zoomDelta:            1,
      wheelPxPerZoomLevel:  140,
      wheelDebounceTime:    20,
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

    setTimeout(() => {
      map.invalidateSize();
      if (zoomable) map.fitWorld({ animate: false });
    }, 150);

    return () => {
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

    vessels.forEach(v => {
      const isSelected = selected && selected.id === v.id;
      const icon = L.divIcon({
        html:      vesselHtml(v, isSelected),
        className: "",
        iconSize:  [24, 24],
        iconAnchor:[12, 12],
      });

      const marker = L.marker([v.lat, v.lon], { icon, zIndexOffset: isSelected ? 500 : 0 });
      marker.on("click", (ev) => { L.DomEvent.stopPropagation(ev); onSelect && onSelect(v); });

      if (showLabels) {
        marker.bindTooltip(v.name || v.id, {
          permanent: true, direction: "right", offset: [10, 0],
          className: "mda-label",
        });
      }

      vl.addLayer(marker);

      if (showTracks && v.sp > 0) {
        const rad = (v.course - 90) * Math.PI / 180;
        const dist = 0.18 + v.sp * 0.012;
        const vt = window.VTYPE[v.type] || window.VTYPE.cargo;
        L.polyline(
          [[v.lat, v.lon], [v.lat + Math.sin(rad) * dist, v.lon + Math.cos(rad) * dist]],
          { color: vt.color, weight: 1.5, opacity: 0.55, dashArray: "4 6" }
        ).addTo(tl);
      }
    });
  }, [vessels, selected, showLabels, showTracks]);

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
      const title = (p.title && (lang === "th" ? (p.title.th || p.title.en) : (p.title.en || p.title.th))) || "";
      const where = p.region ? (lang === "th" ? p.region.th : p.region.en) : "";
      L.marker([p.lat, p.lon], { icon })
        .bindTooltip(
          `<div style="max-width:250px;white-space:normal;line-height:1.4">
             <div style="opacity:.65;font-size:9px">${where}${p.outlet ? " · " + p.outlet : ""}</div>
             <div>${title}</div>
           </div>`,
          { direction: "top", offset: [0, -6], className: "mda-label", sticky: false }
        )
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
    map.flyTo([view.lat, view.lon], view.zoom || 5, { duration: 1.1 });
  }, [view]);

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

Object.assign(window, { MapView, projPt, projX, projY, SHIPPING_LANES });
