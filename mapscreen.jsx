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

  useEffect(() => {
    if (focus && showToast) {
      showToast(T("แสดงตำแหน่งจากข่าว", "Showing location from news") + (focus.label ? " · " + focus.label : ""), "info");
    }
  }, []);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [visible, setVisible] = useState({
    cargo: true, tanker: true, fishing: true, navy: true, dark: true,
    incidents: true,   // จุดเหตุการณ์จากข่าวบนแผนที่
  });
  const [layers, setLayers] = useState({ tracks: true, labels: false, sweep: true, lanes: true, chokes: true });
  const toggle = (k) => setLayers(l => ({ ...l, [k]: !l[k] }));
  const toggleVis = (k) => setVisible(s => ({ ...s, [k]: !s[k] }));
  const setAllVis = (val) => setVisible({ cargo: val, tanker: val, fishing: val, navy: val, dark: val, incidents: val });

  // หมุดเรือมาจากข่าวจริง (สแกนชื่อเรือ+พื้นที่จากฟีดข่าว) แทนเรือ dummy
  const { news: liveNews } = window.useNewsUpdater(data.news);
  const vessels = React.useMemo(
    () => (window.extractVesselsFromNews ? window.extractVesselsFromNews(liveNews) : []),
    [liveNews]
  );

  const ofInterest = vessels.filter(v => v.status !== "normal" && v.status !== "friendly");

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
  const hiddenCount = Object.keys(window.VTYPE).filter(k => !visible[k]).length + (visible.incidents ? 0 : 1);

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

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", paddingBottom: 16 }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
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
        </div>
      </div>

      {/* search + vessel-type filters */}
      <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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

                <div className="divider" style={{ margin: "6px 4px" }} />
                <div className="dim up" style={{ fontSize: 10, padding: "2px 9px 4px" }}>{T("ชั้นข้อมูลแผนที่", "Map layers")}</div>
                <CheckRow checked={layers.tracks} onChange={() => toggle("tracks")} label={T("เส้นทาง AIS", "AIS tracks")} />
                <CheckRow checked={layers.labels} onChange={() => toggle("labels")} label={T("ป้ายเรือ", "Labels")} />
                <CheckRow checked={layers.lanes}  onChange={() => toggle("lanes")}  label={T("เส้นเดินเรือ", "Ship lanes")} />
                <CheckRow checked={layers.chokes} onChange={() => toggle("chokes")} label={T("ช่องแคบ", "Chokepoints")} />
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

        <span className="topbar-spacer" />
        <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>
          {filteredVessels.length} / {vessels.length} {T("ลำ", "vessels")}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 330px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP */}
        <div className="panel" style={{ padding: 0, position: "relative", overflow: "hidden", isolation: "isolate", borderRadius: 0, border: "none" }}>
          <MapView vessels={filteredVessels} events={data.events} lang={lang}
            selected={selected} onSelect={setSelected} focus={focus} view={mapView}
            onSelectEvent={(e) => onNav("incident", { id: e.id })}
            showTracks={layers.tracks} showEvents={visible.incidents}
            showLabels={layers.labels} sweep={layers.sweep} zoomable={true}
            showLanes={layers.lanes} showChokepoints={layers.chokes}
            initialCenter={focus ? [focus.lat, focus.lon] : [20, 10]} initialZoom={focus ? 5 : 2} />

          {/* top-left stats */}
          <div className="map-hud map-stat">
            <div className="ms">
              <div className="k">{T("แสดงอยู่", "Showing")}</div>
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
          </div>

          {/* legend */}
          <div className="map-hud map-legend">
            {Object.entries(window.VTYPE).map(([k, vt]) => (
              <div className="legend-row" key={k}>
                <span className="sym">
                  <svg width="12" height="12">
                    <path d="M6,1 L10,11 L6,8.5 L2,11 Z"
                      fill={k === "dark" ? "none" : vt.color}
                      stroke={vt.color} strokeWidth="1.2" />
                  </svg>
                </span>
                {tx(vt.label, lang)}
              </div>
            ))}
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

        {/* RIGHT RAIL */}
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
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                  {window.AddEventButton &&
                    <window.AddEventButton addEvent={addEvent} lang={lang} showToast={showToast}
                      className="btn btn-ghost btn-sm" />}
                </div>
                {!data.events.length && (
                  <div className="empty">{T("ยังไม่มีเหตุการณ์บนแผนที่", "No events on the map yet")}</div>
                )}
                {data.events.map(e => (
                  <div key={e.id} className="feed-row evt-row"
                    style={{ gridTemplateColumns: "1fr auto" }}
                    onClick={() => onNav("incident", { id: e.id })}>
                    <div className="evt-main">
                      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                        <SevBadge sev={e.sev} lang={lang} />
                        <span className="mono mute" style={{ fontSize: "var(--fs-xs)" }}>{e.time}</span>
                      </div>
                      <div className="evt-title" style={{ fontSize: "var(--fs-sm)" }}>
                        {tx(e.title, lang)}
                      </div>
                      <div className="evt-meta">
                        <SrcChip srcKey={e.srcKey} />
                        <span>{e.cat}</span>
                      </div>
                    </div>
                    <Icon name="chevR" size={15} style={{ color: "var(--text-mute)", alignSelf: "center" }} />
                  </div>
                ))}
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
  );
}

Object.assign(window, { MapScreen });
