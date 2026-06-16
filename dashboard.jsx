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

function Dashboard({ data, lang, onNav, showToast, addEvent }) {
  const { stats, events, news, sourceMix, catMix, activity24h } = data;
  const T = (th, en) => (lang === "th" ? th : en);
  const [refreshing, setRefreshing] = useState(false);
  const maxSrc = Math.max(...sourceMix.map(s => s.count));
  const maxCat = Math.max(...catMix.map(c => c.count));

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

      {/* stat tiles */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 12 }}>
        <StatTile icon="ship" k={T("เรือที่ติดตาม", "Vessels tracked")}
          v={stats.vesselsTracked.toLocaleString()}
          delta={{ dir: "up", text: "+" + stats.vesselsDelta + " " + T("วันนี้", "today") }} />
        <StatTile icon="alert" k={T("เหตุการณ์ที่ใช้งาน", "Active incidents")}
          v={stats.activeIncidents} glow color="var(--crit)" />
        <StatTile icon="target" k={T("เรือปิดสัญญาณ", "Dark vessels")}
          v={stats.darkVessels} color="var(--crit)" />
        <StatTile icon="feed" k={T("ข่าว OSINT วันนี้", "OSINT today")}
          v={stats.osintToday}
          delta={{ dir: "up", text: "+" + stats.osintDelta }}
          bars={activity24h.slice(-10)} />
        <StatTile icon="cpu" k={T("AI ประมวลผลแล้ว", "AI processed")}
          v={stats.aiProcessed} color="var(--accent)" />
        <StatTile icon="shield" k={T("ความครอบคลุม", "Coverage")}
          v={stats.coverage} unit="%" color="var(--ok)" />
      </div>

      {/* main grid */}
      <div className="grid" style={{
        gridTemplateColumns: "1.55fr 1.1fr 0.95fr",
        alignItems: "stretch",
        height: "calc(100vh - 270px)", minHeight: 460,
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
              <MapView vessels={data.vessels} events={events} lang={lang} sweep
                selected={null}
                onSelect={(v) => onNav("map", { vessel: v })}
                onSelectEvent={(e) => onNav("incident", { id: e.id })} />
              <div className="map-hud map-stat" style={{ left: 10, top: 10 }}>
                <div className="ms">
                  <div className="k">{T("เรือในพื้นที่", "In area")}</div>
                  <div className="v">{data.vessels.length}</div>
                </div>
                <div className="ms">
                  <div className="k">{T("เฝ้าระวัง", "Of interest")}</div>
                  <div className="v" style={{ color: "var(--accent)" }}>
                    {data.vessels.filter(v => v.status !== "normal" && v.status !== "friendly").length}
                  </div>
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
                  className="btn btn-ghost btn-sm" />}
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

        {/* right column */}
        <div className="col" style={{ gap: 12, minHeight: 0, overflow: "auto" }}>
          <Panel title={T("ระดับภัยคุกคาม", "Threat Posture")} icon="shield">
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              <Gauge value={68} label={T("ดัชนี", "INDEX")} color="var(--accent)" />
              <div className="col" style={{ gap: 8, flex: 1 }}>
                <div><span className="badge badge-warn"><span className="bdot"></span>ELEVATED</span></div>
                <div className="dim" style={{ fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
                  {T(
                    "เฝ้าระวังสูงจากภัยทะเลแดง กองเรือเงา และความตึงเครียดในทะเลจีนใต้",
                    "Elevated by Red Sea threat, shadow-fleet activity, and SCS tension."
                  )}
                </div>
              </div>
            </div>
            <div className="divider"></div>
            <ThreatMeter value={68} lang={lang} />
          </Panel>

          <Panel title={T("แหล่งข่าว OSINT", "OSINT Sources")} icon="feed"
            action={
              <a className="panel-link" onClick={() => onNav("osint")}>
                {T("ฟีด", "Feed")}<Icon name="chevR" size={13} />
              </a>
            }>
            {sourceMix.map(s => (
              <div className="srcbar" key={s.key}>
                <div className="nm"><SrcChip srcKey={s.key} /></div>
                <div className="track">
                  <div className="fill" style={{ width: (s.count / maxSrc * 100) + "%" }}></div>
                </div>
                <div className="ct">{s.count}</div>
              </div>
            ))}
          </Panel>

          <Panel title={T("หมวดเหตุการณ์ (7 วัน)", "Incident Mix (7d)")} icon="list">
            {catMix.map(c => (
              <div className="srcbar" key={c.key}>
                <div className="nm" style={{ width: 110 }}>{tx(c.label, lang)}</div>
                <div className="track">
                  <div className="fill" style={{ width: (c.count / maxCat * 100) + "%", background: c.color }}></div>
                </div>
                <div className="ct">{c.count}</div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, StatTile });
