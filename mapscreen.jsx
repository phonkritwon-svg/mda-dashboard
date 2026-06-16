/* ============================================================
   Screen: Live Map + Events
   ============================================================ */
function MapScreen({ data, lang, onNav, initial, showToast }) {
  const T = (th, en) => lang === "th" ? th : en;
  const [selected, setSelected] = useState(initial && initial.vessel ? initial.vessel : null);
  const [tab, setTab] = useState("events");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState(() => new Set());   // ว่าง = ทุกประเภท
  const [layers, setLayers] = useState({ tracks: true, events: true, labels: false, sweep: true, lanes: true, chokes: true });
  const toggle = (k) => setLayers(l => ({ ...l, [k]: !l[k] }));
  const toggleType = (k) => setActiveTypes(s => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const ofInterest = data.vessels.filter(v => v.status !== "normal" && v.status !== "friendly");

  const q = search.trim().toLowerCase();
  const filteredVessels = data.vessels.filter(v => {
    // สถานะ (แท็บ)
    if (filterType === "watch" && (v.status === "normal" || v.status === "friendly")) return false;
    // ประเภทเรือ (ปุ่มกรอง)
    if (activeTypes.size && !activeTypes.has(v.type)) return false;
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
    const rows = data.vessels.map(v =>
      [v.id, '"' + v.name + '"', v.flag, v.type, v.sp, v.course, v.lat, v.lon, v.status].join(",")
    ).join("\n");
    const blob = new Blob([hdr + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mda_vessels.csv"; a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast(T("ส่งออกข้อมูลเรือ " + data.vessels.length + " ลำแล้ว", "Exported " + data.vessels.length + " vessels to CSV"), "ok");
  };

  const LayerBtn = ({ k, label }) => (
    <button className={"btn btn-sm" + (layers[k] ? " btn-primary" : " btn-ghost")}
      onClick={() => toggle(k)} style={{ justifyContent: "flex-start", width: "100%" }}>
      <Icon name={layers[k] ? "check" : "minus"} size={13} />{label}
    </button>
  );

  const filterTabs = [
    { key: "all",   th: "ทั้งหมด",   en: "All" },
    { key: "watch", th: "เฝ้าระวัง", en: "Of interest" },
  ];

  const inputStyle = {
    background: "var(--surface)", border: "1px solid var(--border-2)",
    borderRadius: 7, padding: "7px 10px 7px 30px", color: "var(--text)",
    fontSize: "var(--fs-sm)", fontFamily: "var(--font-ui)", outline: "none", width: 230,
  };

  const TypeChip = ({ k, vt }) => {
    const on = activeTypes.has(k);
    const count = data.vessels.filter(v => v.type === k).length;
    return (
      <button onClick={() => toggleType(k)} className="btn btn-sm"
        style={{
          gap: 6, height: 30,
          border: "1px solid " + (on ? vt.color : "var(--border-2)"),
          background: on ? "color-mix(in srgb, " + vt.color + " 16%, transparent)" : "transparent",
          color: on ? vt.color : "var(--text-dim)",
        }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: vt.color, flex: "none" }} />
        {tx(vt.label, lang)}
        <span className="mono" style={{ opacity: 0.7, fontSize: 10 }}>{count}</span>
      </button>
    );
  };

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

        <div style={{ width: 1, height: 22, background: "var(--border)" }} />

        <span className="dim up" style={{ fontSize: 10 }}>{T("ประเภทเรือ", "Ship type")}</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {Object.entries(window.VTYPE).map(([k, vt]) => <TypeChip key={k} k={k} vt={vt} />)}
          {activeTypes.size > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ height: 30 }}
              onClick={() => setActiveTypes(new Set())}>
              <Icon name="minus" size={13} />{T("ล้างตัวกรอง", "Clear")}
            </button>
          )}
        </div>

        <span className="topbar-spacer" />
        <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>
          {filteredVessels.length} / {data.vessels.length} {T("ลำ", "vessels")}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 330px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP */}
        <div className="panel" style={{ padding: 0, position: "relative", overflow: "hidden", isolation: "isolate", borderRadius: 0, border: "none" }}>
          <MapView vessels={filteredVessels} events={data.events} lang={lang}
            selected={selected} onSelect={setSelected}
            onSelectEvent={(e) => onNav("incident", { id: e.id })}
            showTracks={layers.tracks} showEvents={layers.events}
            showLabels={layers.labels} sweep={layers.sweep} zoomable={true}
            showLanes={layers.lanes} showChokepoints={layers.chokes}
            initialCenter={[20, 10]} initialZoom={2} />

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

          {/* top-right layer controls */}
          <div className="map-hud map-tools" style={{ width: 168 }}>
            <LayerBtn k="tracks" label={T("เส้นทาง AIS", "AIS tracks")} />
            <LayerBtn k="events" label={T("เหตุการณ์", "Events")} />
            <LayerBtn k="labels" label={T("ป้ายเรือ", "Labels")} />
            <LayerBtn k="lanes"  label={T("เส้นเดินเรือ", "Ship lanes")} />
            <LayerBtn k="chokes" label={T("ช่องแคบ", "Chokepoints")} />
            <LayerBtn k="sweep"  label={T("เรดาร์กวาด", "Radar sweep")} />
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
                      onNav("incident", { id: inc ? inc.id : data.events[0].id });
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
