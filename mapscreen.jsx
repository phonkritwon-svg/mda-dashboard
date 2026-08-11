/* ============================================================
   Screen: Live Map + Events
   ============================================================ */
/* พื้นที่ทางทะเลสำหรับ "เลือกหัวข้อ → บินไปบนแผนที่" (lat, lon, zoom) */
const MAP_REGIONS = [
  { gh: "พื้นที่ยุทธศาสตร์ (อาเซียน)", ge: "Strategic areas (ASEAN)", items: [
    { th: "ทะเลจีนใต้",        en: "South China Sea",     lat: 14.0, lon: 115.0, z: 5 },
    { th: "อ่าวไทย",          en: "Gulf of Thailand",    lat: 9.5,  lon: 101.5, z: 6 },
    { th: "ทะเลอันดามัน",      en: "Andaman Sea",         lat: 10.0, lon: 96.0,  z: 6 },
    { th: "ช่องแคบมะละกา",     en: "Strait of Malacca",   lat: 3.0,  lon: 100.0, z: 6 },
    { th: "ช่องแคบสิงคโปร์",   en: "Singapore Strait",    lat: 1.2,  lon: 104.0, z: 8 },
    { th: "ทะเลซูลู",         en: "Sulu Sea",            lat: 8.0,  lon: 120.0, z: 6 },
    { th: "ทะเลเซเลเบส",      en: "Celebes Sea",         lat: 3.5,  lon: 122.0, z: 6 },
    { th: "เกาะกูด–เกาะกง (ไทย–กัมพูชา)", en: "Ko Kut–Koh Kong (TH–KH)", lat: 11.6, lon: 102.8, z: 9 },
    { th: "พื้นที่อ้างสิทธิทับซ้อน (OCA)", en: "Overlapping Claims Area (OCA)", lat: 8.0, lon: 102.5, z: 7 },
  ]},
  { gh: "ช่องแคบ / จุดร้อนโลก", ge: "Global chokepoints", items: [
    { th: "ทะเลแดง / บับเอลมันเดบ", en: "Red Sea / Bab el-Mandeb", lat: 13.5, lon: 43.3, z: 6 },
    { th: "ช่องแคบฮอร์มุซ",    en: "Strait of Hormuz",    lat: 26.5, lon: 56.3, z: 7 },
    { th: "อ่าวเอเดน",        en: "Gulf of Aden",        lat: 12.5, lon: 47.0, z: 6 },
    { th: "ทะเลดำ",          en: "Black Sea",           lat: 44.0, lon: 36.0, z: 5 },
    { th: "ทะเลบอลติก",       en: "Baltic Sea",          lat: 59.0, lon: 21.0, z: 5 },
  ]},
  { gh: "มหาสมุทร (MDA)", ge: "Oceans (MDA)", items: [
    { th: "มหาสมุทรแปซิฟิก",   en: "Pacific Ocean",       lat: 0.0,   lon: -160.0, z: 3 },
    { th: "มหาสมุทรแอตแลนติก", en: "Atlantic Ocean",      lat: 10.0,  lon: -40.0,  z: 3 },
    { th: "มหาสมุทรอินเดีย",   en: "Indian Ocean",        lat: -10.0, lon: 75.0,   z: 3 },
    { th: "มหาสมุทรอาร์กติก",  en: "Arctic Ocean",        lat: 80.0,  lon: 0.0,    z: 3 },
    { th: "มหาสมุทรใต้",      en: "Southern Ocean",      lat: -58.0, lon: 20.0,   z: 3 },
  ]},
];

function MapScreen({ data, lang, onNav, initial, showToast, addEvent }) {
  const T = (th, en) => lang === "th" ? th : en;
  const [selected, setSelected] = useState(initial && initial.vessel ? initial.vessel : null);
  const [focus] = useState(initial && initial.focus ? initial.focus : null);
  const [tab, setTab] = useState("events");
  const [mapView, setMapView] = useState(null);     // {lat,lon,zoom} → บินไปพื้นที่ที่เลือก
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionLabel, setRegionLabel] = useState(null);
  const pickRegion = (r) => {
    setMapView({ lat: r.lat, lon: r.lon, zoom: r.z });
    setRegionLabel(r === null ? null : (lang === "th" ? r.th : r.en));
    setRegionOpen(false);
  };
  const resetRegion = () => { setMapView({ lat: 20, lon: 10, zoom: 2 }); setRegionLabel(null); setRegionOpen(false); };

  /* ── โหมดเต็มจอ: ซ่อน UI รอบข้างทั้งหมด เหลือเฉพาะแผนที่ ──
     ใช้เทคนิค FLIP — จำกรอบแผนที่ก่อนสลับโหมด แล้วให้แผนที่ "ค่อย ๆ ขยาย"
     จากตำแหน่งเดิมไปเต็มจอด้วย transform (ลื่นเพราะใช้ GPU) */
  const FS_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";   // ease-out-quint: ออกตัวเร็ว จบนุ่ม
  const FS_MS   = 520;
  const [fullscreen, setFullscreen] = useState(false);
  const mapPanelRef = React.useRef(null);
  const fromRectRef = React.useRef(null);

  // เก็บกรอบแผนที่ "ก่อน" React จัดเลย์เอาต์ใหม่ เพื่อใช้เป็นจุดตั้งต้นของอนิเมชัน
  const switchFullscreen = React.useCallback((next) => {
    setFullscreen(prev => {
      if (prev === next) return prev;
      const el = mapPanelRef.current;
      fromRectRef.current = el ? el.getBoundingClientRect() : null;
      return next;
    });
  }, []);

  React.useLayoutEffect(() => {
    const el = mapPanelRef.current;
    const from = fromRectRef.current;
    fromRectRef.current = null;
    if (!el || !from) return;

    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) return;

    // ย้อนแผนที่กลับไปทับตำแหน่งเดิมก่อน (ยังไม่มีอนิเมชัน) แล้วค่อยปล่อยให้วิ่งเข้าที่
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;

    el.style.transformOrigin = "top left";
    el.style.willChange = "transform";

    // 1) วางแผนที่ทับตำแหน่งเดิมแบบไม่มีอนิเมชัน
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    void el.offsetWidth;   // บังคับ reflow ให้ค่าข้างบนมีผลจริงก่อน (ไม่ต้องรอ rAF)

    // 2) ปล่อยให้วิ่งเข้าที่จริงอย่างนุ่มนวล
    el.style.transition = `transform ${FS_MS}ms ${FS_EASE}`;
    el.style.transform = "";

    const done = () => { el.style.transition = ""; el.style.willChange = ""; el.style.transform = ""; };
    el.addEventListener("transitionend", done, { once: true });
    const guard = setTimeout(done, FS_MS + 120);   // กันกรณี transitionend ไม่ยิง
    return () => { clearTimeout(guard); el.removeEventListener("transitionend", done); };
  }, [fullscreen]);

  // ออกจากโหมดเต็มจอด้วยปุ่ม Esc
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") switchFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchFullscreen]);

  useEffect(() => {
    if (focus && showToast) {
      showToast(T("แสดงตำแหน่งจากข่าว", "Showing location from news") + (focus.label ? " · " + focus.label : ""), "info");
    }
  }, []);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [visible, setVisible] = useState({
    cargo: true, tanker: true, fishing: true, navy: true, unknown: true, dark: true,
    incidents: true,   // จุดเหตุการณ์จากข่าวบนแผนที่
    news: true,        // จุดข่าวทั้งหมดที่ระบุพื้นที่ได้
  });
  const [layers, setLayers] = useState({ tracks: true, labels: false, sweep: true, lanes: true });
  const toggle = (k) => setLayers(l => ({ ...l, [k]: !l[k] }));
  const toggleVis = (k) => setVisible(s => ({ ...s, [k]: !s[k] }));
  const setAllVis = (val) => setVisible({ cargo: val, tanker: val, fishing: val, navy: val, unknown: val, dark: val, incidents: val, news: val });

  const { news: liveNews } = window.useNewsUpdater(data.news);

  /* ── หมุดเรือ ──
     ถ้าเซิร์ฟเวอร์ต่อ AISStream ได้ → ใช้ตำแหน่งเรือจริง หมุดจะขยับเองตามเรือที่แล่นอยู่
     ถ้ายังไม่ได้ตั้งคีย์ AIS → ถอยไปใช้หมุดที่สกัดจากข่าว (ตำแหน่งโดยประมาณตามภูมิภาค) */
  const { aisVessels, ais } = window.useLiveVessels();
  const newsVessels = React.useMemo(
    () => (window.extractVesselsFromNews ? window.extractVesselsFromNews(liveNews) : []),
    [liveNews]
  );
  const usingAis = aisVessels.length > 0;
  const vessels = usingAis ? aisVessels : newsVessels;

  // อ่านข่าวทุกชิ้น → หาพื้นที่จากเนื้อข่าว → ปักเป็นจุดบนแผนที่
  const newsPointsAll = React.useMemo(
    () => (window.extractNewsPointsFromNews ? window.extractNewsPointsFromNews(liveNews) : []),
    [liveNews]
  );

  /* ── โหมดเน้นข่าวในประเทศไทย ────────────────────────────────────
     กรองเหลือเฉพาะจุดที่เนื้อข่าวชี้ว่าเกิดในราชอาณาจักร
     ต่างจากปุ่ม "เน้นเพื่อนบ้าน" ที่เพียงดันขึ้นก่อนแต่ยังแสดงทั้งโลก —
     บนแผนที่การซ่อนของที่ไม่เกี่ยวชัดเจนกว่าการเรียงลำดับ            */
  const [thaiOnly, setThaiOnly] = useState(false);
  const newsPoints = React.useMemo(() => {
    if (!thaiOnly) return newsPointsAll;
    return newsPointsAll.filter(p => {
      const n = p.item || {};
      const hay = [
        p.region && p.region.th, p.region && p.region.en,
        n.raw && n.raw.th, n.raw && n.raw.en,
        n.ai && n.ai.th, n.ai && n.ai.en, n.outlet,
      ].filter(Boolean).join("  ");
      return window.isThaiDomestic ? window.isThaiDomestic(hay) : true;
    });
  }, [newsPointsAll, thaiOnly]);

  const ofInterest = vessels.filter(v => v.status !== "normal" && v.status !== "friendly");

  // ── ช่วงเวลาที่สนใจ (time scope) สำหรับรายการเหตุการณ์ + หมุดบนแผนที่ ──
  const [evScope, setEvScope]           = useState({ key: "all", from: "", to: "" });
  const [evArchive, setEvArchive]       = useState(null);
  const [evScopeLoading, setEvScopeLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (evScope.key === "all") { setEvArchive(null); setEvScopeLoading(false); return; }
    const w = window.timeWindow(evScope);
    if (evScope.key === "custom" && !w.since && !w.until) { setEvArchive(null); return; }
    setEvScopeLoading(true);
    Promise.resolve(window.queryEventsArchive
        ? window.queryEventsArchive(w.since && w.since.toISOString(), w.until && w.until.toISOString(), 2000)
        : [])
      .then(items => { if (active) { setEvArchive(items); setEvScopeLoading(false); } })
      .catch(() => { if (active) { setEvArchive(null); setEvScopeLoading(false); } });
    return () => { active = false; };
  }, [evScope.key, evScope.from, evScope.to]);

  const scopedEvents = React.useMemo(() => {
    const w = window.timeWindow(evScope);
    let pool = data.events;
    if (evScope.key !== "all" && evArchive) {
      const m = new Map();
      evArchive.forEach(e => m.set(e.id, e));
      data.events.forEach(e => m.set(e.id, e));   // live ทับ archived
      pool = Array.from(m.values());
    }
    const filtered = evScope.key === "all"
      ? pool
      : pool.filter(e => window.inTimeWindow(e.publishedAt, w.since, w.until));
    return filtered.slice().sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }, [data.events, evArchive, evScope]);

  // เน้นเพื่อนบ้าน (กัมพูชา/พม่า/มาเลเซีย): ดันเหตุการณ์ขึ้นก่อน แต่ยังเห็นทั่วโลก
  const [evFocusOn, setEvFocusOn] = useState(true);
  const evHay = (e) => [tx(e.title, "th"), tx(e.title, "en"), tx(e.region, "th"), tx(e.region, "en"),
    tx(e.area, "th"), tx(e.area, "en"), tx(e.summary, "th"), tx(e.summary, "en"),
    e.cat, e.source && e.source.outlet].filter(Boolean).join(" ");
  const evGroups = window.focusPartition(scopedEvents, evHay, evFocusOn);
  const renderEvtRow = (e) => (
    <div key={e.id} className="feed-row evt-row" style={{ gridTemplateColumns: "1fr auto" }}
      onClick={() => onNav("incident", { id: e.id })}>
      <div className="evt-main">
        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
          <SevBadge sev={e.sev} lang={lang} />
          <span className="mono mute" style={{ fontSize: "var(--fs-xs)" }}>{e.time}</span>
        </div>
        <div className="evt-title" style={{ fontSize: "var(--fs-sm)" }}>{tx(e.title, lang)}</div>
        <div className="evt-meta">
          <SrcChip srcKey={e.srcKey} />
          <span>{e.cat}</span>
        </div>
      </div>
      <Icon name="chevR" size={15} style={{ color: "var(--text-mute)", alignSelf: "center" }} />
    </div>
  );

  const q = search.trim().toLowerCase();
  const filteredVessels = vessels.filter(v => {
    // สถานะ (แท็บ)
    if (filterType === "watch" && (v.status === "normal" || v.status === "friendly")) return false;
    // ประเภทเรือ (ติ๊กในตัวกรอง)
    if (!visible[v.type]) return false;
    // ค้นหา ชื่อ/ID/ธง
    if (q && !(
      (v.name || "").toLowerCase().includes(q) ||
      (v.id   || "").toLowerCase().includes(q) ||
      (v.flag || "").toLowerCase().includes(q)
    )) return false;
    return true;
  });

  const handleExport = () => {
    const hdr = "ID,Name,Flag,Type,Speed_kn,Course,Lat,Lon,Status\n";
    const rows = vessels.map(v =>
      [v.id, '"' + v.name + '"', v.flag, v.type, v.sp, v.course, v.lat, v.lon, v.status].join(",")
    ).join("\n");
    const blob = new Blob([hdr + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mda_vessels.csv"; a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast(T("ส่งออกข้อมูลเรือ " + vessels.length + " ลำแล้ว", "Exported " + vessels.length + " vessels to CSV"), "ok");
  };

  const filterTabs = [
    { key: "all",   th: "ทั้งหมด",   en: "All" },
    { key: "watch", th: "เฝ้าระวัง", en: "Of interest" },
  ];

  const inputStyle = {
    background: "var(--surface)", border: "1px solid var(--border-2)",
    borderRadius: 7, padding: "7px 10px 7px 30px", color: "var(--text)",
    fontSize: "var(--fs-sm)", fontFamily: "var(--font-ui)", outline: "none", width: 230,
  };

  const typeCount = (k) => vessels.filter(v => v.type === k).length;
  const hiddenCount = Object.keys(window.VTYPE).filter(k => !visible[k]).length
    + (visible.incidents ? 0 : 1) + (visible.news ? 0 : 1);

  const CheckRow = ({ checked, onChange, color, label, count }) => (
    <label
      style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", cursor: "pointer", borderRadius: 7, userSelect: "none" }}>
      <input type="checkbox" checked={!!checked} onChange={onChange}
        style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer", flex: "none" }} />
      {color && <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flex: "none" }} />}
      <span style={{ flex: 1, fontSize: "var(--fs-sm)" }}>{label}</span>
      {count != null && <span className="mono dim" style={{ fontSize: 11 }}>{count}</span>}
    </label>
  );

  // UI รอบข้าง: ค่อย ๆ จางหายตอนเข้าเต็มจอ แทนการหายวับ
  const chromeStyle = {
    opacity: fullscreen ? 0 : 1,
    transform: fullscreen ? "translateY(-6px)" : "none",
    transition: `opacity ${Math.round(FS_MS * 0.5)}ms ease, transform ${Math.round(FS_MS * 0.5)}ms ${FS_EASE}`,
    pointerEvents: fullscreen ? "none" : "auto",
  };

  return (
    <div className="screen"
      style={{ height: "100%", display: "flex", flexDirection: "column", paddingBottom: 16 }}>
      {/* ฉากหลังทึบ: จางเข้ามาคลุมเมนู/แถบบนของแอป ระหว่างแผนที่ขยายเต็มจอ */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 880, background: "var(--bg)",
        opacity: fullscreen ? 1 : 0,
        transition: `opacity ${Math.round(FS_MS * 0.6)}ms ease`,
        pointerEvents: fullscreen ? "auto" : "none",
        visibility: fullscreen ? "visible" : "hidden",
      }} />

      <div className="page-head" style={{ marginBottom: 12, ...chromeStyle }}>
        <div>
          <div className="eyebrow">LIVE TACTICAL MAP</div>
          <div className="page-title">{T("แผนที่สถานการณ์ · เรือและเหตุการณ์", "Situation Map · Vessels & Events")}</div>
        </div>
        <div className="row">
          <div className="pill-tabs">
            {filterTabs.map(ft => (
              <div key={ft.key}
                className={"pill-tab" + (filterType === ft.key ? " active" : "")}
                onClick={() => setFilterType(ft.key)}>
                {T(ft.th, ft.en)}
                {ft.key === "watch" && (
                  <span style={{
                    marginLeft: 5, fontSize: 9, background: "var(--crit)", color: "#fff",
                    borderRadius: 8, padding: "1px 5px", fontFamily: "var(--font-mono)",
                  }}>{ofInterest.length}</span>
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>
            <Icon name="download" size={14} />{T("ส่งออก CSV", "Export CSV")}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => switchFullscreen(true)}
            title={T("แสดงแผนที่เต็มจอ (ออกด้วย Esc)", "Fullscreen map (Esc to exit)")}>
            <Icon name="expand" size={14} />{T("เต็มจอ", "Fullscreen")}
          </button>
        </div>
      </div>

      {/* search + vessel-type filters */}
      <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: "wrap", alignItems: "center", ...chromeStyle }}>
        <div style={{ position: "relative" }}>
          <Icon name="search" size={14}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={T("ค้นหาเรือ (ชื่อ / ID / ธง)", "Search vessels (name / ID / flag)")}
            style={inputStyle} />
          {search && (
            <span onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}>
              <Icon name="minus" size={14} />
            </span>
          )}
        </div>

        {/* Filter button → inline modal (checkboxes) */}
        <div style={{ position: "relative" }}>
          <button className={"btn btn-sm " + (filterOpen ? "btn-primary" : "btn-ghost")}
            onClick={() => setFilterOpen(o => !o)}>
            <Icon name="filter" size={14} />{T("ตัวกรอง", "Filter")}
            {hiddenCount > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, background: "var(--accent)", color: "#000",
                borderRadius: 8, padding: "1px 6px", fontFamily: "var(--font-mono)" }}>{hiddenCount}</span>
            )}
          </button>

          {filterOpen && (
            <>
              <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 61, width: 252,
                background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 11,
                boxShadow: "var(--shadow)", padding: 8,
                maxHeight: "min(72vh, 520px)", overflowY: "auto",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 9px 7px" }}>
                  <span className="dim up" style={{ fontSize: 10 }}>{T("ประเภทเรือ", "Ship types")}</span>
                  <span style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 10, color: "var(--info)", cursor: "pointer" }} onClick={() => setAllVis(true)}>{T("ทั้งหมด", "All")}</span>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", cursor: "pointer" }} onClick={() => setAllVis(false)}>{T("ล้าง", "None")}</span>
                  </span>
                </div>
                {Object.entries(window.VTYPE).map(([k, vt]) => (
                  <CheckRow key={k} checked={visible[k]} onChange={() => toggleVis(k)}
                    color={vt.color} label={tx(vt.label, lang)} count={typeCount(k)} />
                ))}

                <div className="divider" style={{ margin: "6px 4px" }} />
                <div className="dim up" style={{ fontSize: 10, padding: "2px 9px 4px" }}>{T("เหตุการณ์จากข่าว", "Incidents (news)")}</div>
                <CheckRow checked={visible.incidents} onChange={() => toggleVis("incidents")}
                  color="var(--crit)" label={T("จุดเหตุการณ์บนแผนที่", "Incident dots")} count={data.events.length} />
                <CheckRow checked={visible.news} onChange={() => toggleVis("news")}
                  color="#5fb0c9" label={T("จุดข่าวบนแผนที่", "News dots")} count={newsPoints.length} />

                <div className="divider" style={{ margin: "6px 4px" }} />
                <div className="dim up" style={{ fontSize: 10, padding: "2px 9px 4px" }}>{T("ชั้นข้อมูลแผนที่", "Map layers")}</div>
                <CheckRow checked={layers.tracks} onChange={() => toggle("tracks")} label={T("เส้นทาง AIS", "AIS tracks")} />
                <CheckRow checked={layers.labels} onChange={() => toggle("labels")} label={T("ป้ายเรือ", "Labels")} />
                <CheckRow checked={layers.lanes}  onChange={() => toggle("lanes")}  label={T("เส้นเดินเรือ", "Ship lanes")} />
                <CheckRow checked={layers.sweep}  onChange={() => toggle("sweep")}  label={T("เรดาร์กวาด", "Radar sweep")} />
              </div>
            </>
          )}
        </div>

        {/* Region quick-jump → บินไปพื้นที่ทางทะเล */}
        <div style={{ position: "relative" }}>
          <button className={"btn btn-sm " + (regionOpen ? "btn-primary" : "btn-ghost")}
            onClick={() => setRegionOpen(o => !o)}>
            <Icon name="globe" size={14} />{regionLabel || T("เลือกพื้นที่", "Region")}
            <Icon name="chevR" size={12} style={{ transform: "rotate(90deg)", opacity: 0.7 }} />
          </button>

          {regionOpen && (
            <>
              <div onClick={() => setRegionOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 61, width: 252,
                background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 11,
                boxShadow: "var(--shadow)", padding: 8, maxHeight: "min(72vh, 520px)", overflowY: "auto",
              }}>
                <div className="pill-tab" style={{ justifyContent: "space-between", display: "flex" }} onClick={resetRegion}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="globe" size={13} />{T("ทั่วโลก (รีเซ็ต)", "Global (reset)")}
                  </span>
                </div>
                {MAP_REGIONS.map((grp, gi) => (
                  <div key={gi}>
                    <div className="divider" style={{ margin: "6px 4px" }} />
                    <div className="dim up" style={{ fontSize: 10, padding: "2px 9px 4px" }}>{T(grp.gh, grp.ge)}</div>
                    {grp.items.map((r, ri) => (
                      <div key={ri} className={"pill-tab" + (regionLabel === (lang === "th" ? r.th : r.en) ? " active" : "")}
                        style={{ display: "flex" }} onClick={() => pickRegion(r)}>
                        <Icon name="pin" size={12} style={{ marginRight: 6, color: "var(--accent)" }} />
                        {T(r.th, r.en)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* เน้นข่าวในประเทศไทย — กรองจุดข่าวเหลือเฉพาะในราชอาณาจักร
            แล้วบินไปที่ประเทศไทยให้เลย เพราะกดปุ่มนี้แล้วยังต้องเลื่อนหาเองก็ไม่ครบงาน */}
        <button
          className={"btn btn-sm " + (thaiOnly ? "btn-primary" : "btn-ghost")}
          onClick={() => {
            const next = !thaiOnly;
            setThaiOnly(next);
            if (next) {
              setMapView({ lat: 13.2, lon: 100.9, zoom: 5 });
              setRegionLabel(T("ประเทศไทย", "Thailand"));
            }
          }}
          title={T("แสดงเฉพาะจุดข่าวที่เกิดในประเทศไทย และเลื่อนแผนที่ไปที่ไทย",
                   "Show only news located inside Thailand and move the map there")}>
          <Icon name="pin" size={13} />
          {T("เน้นข่าวไทย", "Thailand only")}
          {thaiOnly && (
            <span className="mono" style={{ opacity: 0.75, marginLeft: 4 }}>
              {newsPoints.length}/{newsPointsAll.length}
            </span>
          )}
        </button>

        <span className="topbar-spacer" />
        <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>
          {filteredVessels.length} / {vessels.length} {T("ลำ", "vessels")}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 330px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP — ในโหมดเต็มจอจะหลุดออกจากกริดไปคลุมทั้งหน้าจอ (มีอนิเมชันขยายจากตำแหน่งเดิม) */}
        <div className="panel" ref={mapPanelRef}
          style={{
            padding: 0, position: fullscreen ? "fixed" : "relative",
            ...(fullscreen ? { inset: 0, zIndex: 890, margin: 0 } : null),
            overflow: "hidden", isolation: "isolate", borderRadius: 0, border: "none",
          }}>
          <MapView vessels={filteredVessels} events={scopedEvents} lang={lang}
            selected={selected} onSelect={setSelected} focus={focus} view={mapView}
            onSelectEvent={(e) => onNav("incident", { id: e.id })}
            newsPoints={newsPoints} showNews={visible.news}
            onSelectNews={(p) => onNav("newsDetail", { item: p.item })}
            showTracks={layers.tracks} showEvents={visible.incidents}
            showLabels={layers.labels} sweep={layers.sweep} zoomable={true}
            showLanes={layers.lanes}
            initialCenter={focus ? [focus.lat, focus.lon] : [20, 10]} initialZoom={focus ? 5 : 2} />

          {/* ปุ่มเข้า/ออกโหมดเต็มจอ — ลอยอยู่มุมขวาบนของแผนที่ */}
          <button className="btn btn-ghost btn-sm"
            onClick={() => switchFullscreen(!fullscreen)}
            title={fullscreen
              ? T("ออกจากโหมดเต็มจอ (Esc)", "Exit fullscreen (Esc)")
              : T("แสดงแผนที่เต็มจอ", "Fullscreen map")}
            style={{
              position: "absolute", top: 12, right: 12, zIndex: 500,
              background: "var(--surface-2)", border: "1px solid var(--border-2)",
              boxShadow: "var(--shadow)",
            }}>
            <Icon name={fullscreen ? "shrink" : "expand"} size={14} />
            {fullscreen ? T("ออกจากเต็มจอ", "Exit") : T("เต็มจอ", "Fullscreen")}
          </button>

          {/* top-left stats */}
          <div className="map-hud map-stat">
            <div className="ms">
              <div className="k">
                {usingAis ? T("เรือ AIS สด", "Live AIS") : T("เรือจากข่าว", "From news")}
                <span style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginLeft: 5,
                  background: usingAis ? "var(--ok)" : "var(--text-mute)",
                }} title={usingAis
                  ? T("รับตำแหน่งจริงจาก AISStream", "Live positions from AISStream")
                  : (ais.error || T("ยังไม่ได้ตั้งคีย์ AIS", "AIS key not configured"))} />
              </div>
              <div className="v">{filteredVessels.length}</div>
            </div>
            <div className="ms">
              <div className="k">{T("เฝ้าระวัง", "Of interest")}</div>
              <div className="v" style={{ color: "var(--accent)" }}>{ofInterest.length}</div>
            </div>
            <div className="ms">
              <div className="k">{T("เหตุการณ์สด", "Live")}</div>
              <div className="v" style={{ color: "var(--crit)" }}>{data.events.filter(e => !e.resolved).length}</div>
            </div>
            <div className="ms">
              <div className="k">{T("จุดข่าว", "News")}</div>
              <div className="v" style={{ color: "#5fb0c9" }}>{visible.news ? newsPoints.length : 0}</div>
            </div>
          </div>

          {/* legend */}
          <div className="map-hud map-legend">
            {Object.entries(window.VTYPE).map(([k, vt]) => (
              <div className="legend-row" key={k}>
                <span className="sym">
                  {/* สัญลักษณ์เรือแบบ VesselFinder — ลูกศรหัวแหลม ท้ายเว้า */}
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M6,0.4 L9.3,11.1 L6,8.9 L2.7,11.1 Z"
                      fill={k === "dark" ? "none" : vt.color}
                      stroke={k === "dark" ? vt.color : (window.VTYPE_STROKE || "#999999")}
                      strokeWidth="1" strokeLinejoin="round" />
                  </svg>
                </span>
                {tx(vt.label, lang)}
              </div>
            ))}
            {/* ความสดของตำแหน่ง — ไม่ใช่ประเภทเรือ จึงแยกออกมาจากรายการข้างบน */}
            <div className="legend-row" title={T(
              "หมุดจะจางลงตามอายุตำแหน่ง · วงประ = เงียบเกิน " + Math.round((window.AIS_LOST_SEC || 600) / 60) + " นาที",
              "Pins fade with position age · dashed ring = silent over " + Math.round((window.AIS_LOST_SEC || 600) / 60) + " min")}>
              <span className="sym">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="5.2" fill="none" strokeDasharray="2 2"
                    stroke={window.VTYPE_STROKE || "#999999"} strokeWidth="1" />
                  <path d="M6,2.6 L8.2,9.4 L6,8 L3.8,9.4 Z"
                    fill={window.VTYPE_STROKE || "#999999"} opacity="0.5" />
                </svg>
              </span>
              {T("ขาดสัญญาณ / ตำแหน่งค้าง", "Signal lost / stale")}
            </div>
            <div className="legend-row">
              <span className="sym">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="5" fill="#5fb0c9" opacity="0.22" />
                  <circle cx="6" cy="6" r="2.5" fill="#5fb0c9" />
                </svg>
              </span>
              {T("จุดข่าว", "News")}
            </div>
          </div>

          {/* vessel detail card */}
          {selected && (
            <div className="map-hud vessel-card">
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="badge badge-mute mono">{selected.id}</span>
                <span className="icon-btn" onClick={() => setSelected(null)} style={{ width: 22, height: 22 }}>
                  <Icon name="minus" size={13} />
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{selected.name}</div>
              <div className="kv">
                <span className="k">{T("ประเภท", "Type")}</span>
                <span className="v" style={{ color: window.VTYPE[selected.type].color }}>
                  {tx(window.VTYPE[selected.type].label, lang)}
                </span>
                <span className="k">{T("ธง", "Flag")}</span>
                <span className="v">{selected.flag}</span>
                <span className="k">{T("ความเร็ว", "Speed")}</span>
                <span className="v">{selected.sp} kn</span>
                <span className="k">{T("เข็ม", "Course")}</span>
                <span className="v">{selected.course}°</span>
                <span className="k">{T("สถานะ", "Status")}</span>
                <span className="v" style={{ color:
                  selected.status === "critical" ? "var(--crit)" :
                  selected.status === "watch"    ? "var(--accent)" : "var(--text)" }}>
                  {selected.status.toUpperCase()}
                </span>
              </div>
              {selected.note && (
                <div style={{ marginTop: 9, padding: "7px 9px", borderRadius: 6,
                  background: "rgba(var(--crit-rgb),0.1)",
                  border: "1px solid rgba(var(--crit-rgb),0.25)",
                  fontSize: "var(--fs-xs)", color: "var(--crit)" }}>
                  <Icon name="alert" size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {tx(selected.note, lang)}
                </div>
              )}
              <div className="row" style={{ gap: 6, marginTop: 9 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                  onClick={() => {
                    if (showToast) showToast(
                      T("กำลังโหลดประวัติ AIS ของ " + selected.name, "Loading AIS history for " + selected.name), "info"
                    );
                  }}>
                  <Icon name="clock" size={13} />{T("ประวัติ AIS", "AIS History")}
                </button>
                {selected.status !== "normal" && selected.status !== "friendly" && (
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                    onClick={() => {
                      const inc = data.events.find(e => e.vessel === selected.id);
                      onNav("incident", { id: inc ? inc.id : (data.events[0] && data.events[0].id) });
                    }}>
                    <Icon name="alert" size={13} />{T("เหตุการณ์", "Incident")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT RAIL — จางหายในโหมดเต็มจอ */}
        <div style={{ minHeight: 0, display: "flex", flexDirection: "column", ...chromeStyle }}>
        <Panel flush
          title={
            <div className="pill-tabs" style={{ border: "none", background: "transparent", padding: 0 }}>
              <div className={"pill-tab" + (tab === "events"  ? " active" : "")} onClick={() => setTab("events")}>
                {T("เหตุการณ์", "Events")}
              </div>
              <div className={"pill-tab" + (tab === "vessels" ? " active" : "")} onClick={() => setTab("vessels")}>
                {T("เรือ", "Vessels")}
              </div>
            </div>
          }
          style={{ minHeight: 0 }}>
          <div className="scroll-y" style={{ height: "100%" }}>
            {tab === "events" ? (
              <div className="feed">
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 8 }}>
                  {window.AddEventButton &&
                    <window.AddEventButton addEvent={addEvent} lang={lang} showToast={showToast}
                      className="btn btn-ghost btn-sm" />}
                  <window.TimeScopeBar scope={evScope} onChange={setEvScope} lang={lang}
                    loading={evScopeLoading} count={scopedEvents.length} />
                  <window.FocusToggle on={evFocusOn} onChange={setEvFocusOn} lang={lang} />
                </div>
                {!scopedEvents.length && (
                  <div className="empty">{evScope.key === "all"
                    ? T("ยังไม่มีเหตุการณ์บนแผนที่", "No events on the map yet")
                    : T("ไม่มีเหตุการณ์ในช่วงเวลานี้", "No events in this period")}</div>
                )}
                {evFocusOn && evGroups.focus.length > 0 && (
                  <window.FocusGroupLabel kind="focus" lang={lang} count={evGroups.focus.length} />
                )}
                {evGroups.focus.map(renderEvtRow)}
                {evFocusOn && evGroups.focus.length > 0 && evGroups.rest.length > 0 && (
                  <window.FocusGroupLabel kind="rest" lang={lang} count={evGroups.rest.length} />
                )}
                {evGroups.rest.map(renderEvtRow)}
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{T("ชื่อ", "Name")}</th>
                    <th className="num">kn</th>
                    <th>{T("สถานะ", "St.")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVessels.map(v => (
                    <tr key={v.id} onClick={() => setSelected(v)}>
                      <td className="mono dim">{v.id}</td>
                      <td>
                        <span style={{ color: window.VTYPE[v.type].color }}>●</span>{" "}
                        {v.name}
                      </td>
                      <td className="num">{v.sp}</td>
                      <td>
                        {v.status !== "normal" && v.status !== "friendly"
                          ? <span className="flash"></span>
                          : <span className="mute">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MapScreen });
