/* ============================================================
   Screen: Dashboard (ภาพรวม / overview)
   ============================================================ */
function StatTile({ k, v, unit, delta, spark, bars, glow, icon, color }) {
  return (
    <div className={"stat" + (glow ? " glow" : "")}>
      <div className="k"><Icon name={icon} size={13} />{k}</div>
      <div className="v" style={glow ? {} : (color ? { color } : {})}>
        {v}{unit && <span className="unit">{unit}</span>}
      </div>
      {delta && (
        <div className={"delta " + delta.dir}>
          <Icon name={delta.dir === "up" ? "arrowUp" : "arrowDown"} size={13} />{delta.text}
        </div>
      )}
      {spark && <div className="spark"><Sparkline data={spark} /></div>}
      {bars  && <div className="spark"><MiniBars data={bars} /></div>}
    </div>
  );
}

function Dashboard({ data, lang, onNav, showToast, addEvent, currentUser }) {
  const { events } = data;
  const T = (th, en) => (lang === "th" ? th : en);
  const [refreshing, setRefreshing] = useState(false);

  /* ── ใช้แหล่งข้อมูลชุดเดียวกับหน้าแผนที่ เพื่อให้แผนที่ทั้งสองหน้าตรงกัน ──
     เดิมหน้านี้อ่านจาก data.vessels ซึ่งเป็นอาเรย์ว่าง แผนที่จึงโล่งไม่เหมือนหน้าแผนที่ */
  const { news: liveNews } = window.useNewsUpdater(data.news);
  const { aisVessels } = window.useLiveVessels();
  const newsVessels = React.useMemo(
    () => (window.extractVesselsFromNews ? window.extractVesselsFromNews(liveNews) : []),
    [liveNews]
  );
  const usingAis = aisVessels.length > 0;
  const vessels = usingAis ? aisVessels : newsVessels;
  const newsPoints = React.useMemo(
    () => (window.extractNewsPointsFromNews ? window.extractNewsPointsFromNews(liveNews) : []),
    [liveNews]
  );
  const ofInterest = vessels.filter(v => v.status !== "normal" && v.status !== "friendly");

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      if (showToast) showToast(T("อัปเดตข้อมูลเรียบร้อย · อัปเดตล่าสุด: ตอนนี้", "Data refreshed · Last update: just now"), "ok");
    }, 1400);
  };

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <div className="eyebrow">COMMON OPERATIONAL PICTURE</div>
          <div className="page-title">{T("ภาพรวมสถานการณ์ทางทะเล", "Maritime Situation Overview")}</div>
          <div className="page-sub">
            {T("มหาสมุทรและช่องแคบยุทธศาสตร์ทั่วโลก · อัปเดตอัตโนมัติ", "Global seas & strategic chokepoints · auto-refresh")}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={refreshing}>
            <Icon name="refresh" size={14}
              style={refreshing ? { animation: "sweep 0.9s linear infinite" } : {}} />
            {refreshing ? T("กำลังอัปเดต...", "Refreshing...") : T("รีเฟรช", "Refresh")}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav("brief")}>
            <Icon name="brief" size={14} />{T("รายงานประจำวัน", "Daily Brief")}
          </button>
        </div>
      </div>

      {/* แถวตัวเลขสถิติถูกลบออก — เดิมเป็นค่าสมมติที่พิมพ์ตายตัว ไม่ได้มาจากข้อมูลจริง */}

      {/* main grid */}
      <div className="grid" style={{
        gridTemplateColumns: "1.55fr 1.1fr 0.95fr",
        alignItems: "stretch",
        height: "calc(100vh - 190px)", minHeight: 460,
      }}>

        {/* left: map preview */}
        <div className="col" style={{ gap: 12, minHeight: 0 }}>
          <Panel title={T("แผนที่สถานการณ์สด", "Live Situation Map")} icon="radar" flush
            style={{ flex: 1, minHeight: 0 }}
            action={
              <a className="panel-link" onClick={() => onNav("map")}>
                {T("เปิดเต็มจอ", "Open full")}<Icon name="chevR" size={13} />
              </a>
            }>
            <div style={{ position: "relative", height: "100%", minHeight: 220 }}>
              {/* ตั้งค่าให้ตรงกับหน้าแผนที่: เรือจากข่าว + จุดข่าว + เหตุการณ์ ชุดเดียวกัน */}
              <MapView vessels={vessels} events={events} lang={lang} sweep
                newsPoints={newsPoints} showNews
                onSelectNews={(p) => onNav("newsDetail", { item: p.item })}
                selected={null}
                onSelect={(v) => onNav("map", { vessel: v })}
                onSelectEvent={(e) => onNav("incident", { id: e.id })} />
              <div className="map-hud map-stat" style={{ left: 10, top: 10 }}>
                <div className="ms">
                  <div className="k">
                    {usingAis ? T("เรือ AIS สด", "Live AIS") : T("เรือจากข่าว", "From news")}
                    <span style={{
                      display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginLeft: 5,
                      background: usingAis ? "var(--ok)" : "var(--text-mute)",
                    }} />
                  </div>
                  <div className="v">{vessels.length}</div>
                </div>
                <div className="ms">
                  <div className="k">{T("เฝ้าระวัง", "Of interest")}</div>
                  <div className="v" style={{ color: "var(--accent)" }}>{ofInterest.length}</div>
                </div>
                <div className="ms">
                  <div className="k">{T("จุดข่าว", "News")}</div>
                  <div className="v" style={{ color: "#5fb0c9" }}>{newsPoints.length}</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* middle: active incidents */}
        <Panel title={T("เหตุการณ์ที่ต้องเฝ้าระวัง", "Active Incidents")} icon="alert" flush
          style={{ minHeight: 0 }}
          action={
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {window.AddEventButton &&
                <window.AddEventButton addEvent={addEvent} lang={lang} showToast={showToast}
                  currentUser={currentUser} className="btn btn-ghost btn-sm" />}
              <a className="panel-link" onClick={() => onNav("incident")}>
                {T("ทั้งหมด", "View all")} ({events.length})
              </a>
            </div>
          }>
          <div className="feed scroll-y" style={{ height: "100%" }}>
            {!events.length && (
              <div className="empty">{T("ยังไม่มีเหตุการณ์ — กด ‘เพิ่มเหตุการณ์’ หรือรอ cron สร้างจากข่าว", "No events yet — click ‘Add Event’ or wait for cron")}</div>
            )}
            {events.map(e => (
              <div key={e.id} className="feed-row evt-row"
                onClick={() => onNav("incident", { id: e.id })}>
                <div className="evt-time">{e.time}</div>
                <div className="evt-main">
                  <div className="row between" style={{ gap: 8, marginBottom: 4 }}>
                    <span className="mono mute" style={{ fontSize: "var(--fs-xs)" }}>
                      {e.id} · {e.cat}
                    </span>
                  </div>
                  <div className="evt-title">{tx(e.title, lang)}</div>
                  <div className="evt-meta">
                    <span className="src"><SrcChip srcKey={e.srcKey} /></span>
                    <span className="row" style={{ gap: 5 }}>
                      <Icon name="pin" size={11} />{tx(e.area, lang)}
                    </span>
                  </div>
                </div>
                <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
                  <SevBadge sev={e.sev} lang={lang} />
                  {e.resolved && <Badge kind="ok" dot>{T("ปิดเหตุ", "RESOLVED")}</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* right column
            แผง "ระดับภัยคุกคาม" / "แหล่งข่าว OSINT" / "หมวดเหตุการณ์" ถูกลบออก
            เดิมใช้ตัวเลขสมมติทั้งหมด (ดัชนี 68, กราฟแท่ง) ไม่ได้คำนวณจากข้อมูลจริง */}
        <div className="col" style={{ gap: 12, minHeight: 0, overflow: "auto" }}>
          {/* สภาพทะเลจริงจาก Open-Meteo — ดึงในเบราว์เซอร์ ไม่ต้องมี key หรือ serverless
              วางไว้บนสุดเพราะสภาพทะเลกำหนดว่าอะไรทำได้บ้างในวันนั้น */}
          <MarineConditions lang={lang} />

          <Panel title={T("ฟีดข่าวกรอง", "Intelligence Feed")} icon="feed"
            action={
              <a className="panel-link" onClick={() => onNav("osint")}>
                {T("เปิดฟีด", "Open feed")}<Icon name="chevR" size={13} />
              </a>
            }>
            <div className="dim" style={{ fontSize: "var(--fs-sm)", lineHeight: 1.7 }}>
              {T("ข่าวทั้งหมดดึงจากสำนักข่าวจริงและแสดงเฉพาะรายการที่มีลิงก์ต้นฉบับตรวจสอบได้",
                 "All reporting is pulled from real outlets; only items with a verifiable source link are shown.")}
            </div>
            <div className="divider"></div>
            <a className="panel-link" onClick={() => onNav("chat")}>
              <Icon name="spark" size={13} />{T("ถาม-ตอบเกี่ยวกับข่าว", "Ask about the reporting")}
            </a>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, StatTile });
