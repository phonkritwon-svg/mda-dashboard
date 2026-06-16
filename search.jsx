/* ============================================================
   Command Palette / Global Search  (Ctrl+K)
   ============================================================ */
function SearchPalette({ open, onClose, lang, data, onNav }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  const T = (th, en) => lang === "th" ? th : en;

  React.useEffect(() => {
    if (open) {
      setQ("");
      const t = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const ql = q.trim().toLowerCase();
  const vessels = ql.length >= 2 ? data.vessels.filter(v =>
    v.name.toLowerCase().includes(ql) || v.id.toLowerCase().includes(ql)
  ) : [];
  const events = ql.length >= 2 ? data.events.filter(e =>
    tx(e.title, lang).toLowerCase().includes(ql) ||
    e.id.toLowerCase().includes(ql) ||
    e.cat.toLowerCase().includes(ql)
  ) : [];
  const news = ql.length >= 2 ? data.news.filter(n =>
    tx(n.raw, lang).toLowerCase().includes(ql) ||
    (n.outlet && n.outlet.toLowerCase().includes(ql))
  ) : [];

  const hasResults = vessels.length + events.length + news.length > 0;

  const quickActions = [
    { icon: "dashboard", th: "ไปหน้า Dashboard", en: "Go to Dashboard",
      action: () => { onNav("dashboard"); onClose(); } },
    { icon: "radar",     th: "เปิดแผนที่สถานการณ์", en: "Open Situation Map",
      action: () => { onNav("map"); onClose(); } },
    { icon: "feed",      th: "ฟีดข่าวกรอง OSINT", en: "OSINT Intelligence Feed",
      action: () => { onNav("osint"); onClose(); } },
    { icon: "alert",     th: "รายการเหตุการณ์ทั้งหมด", en: "All Incidents",
      action: () => { onNav("incident"); onClose(); } },
    { icon: "brief",     th: "รายงานสรุปประจำวัน", en: "Daily Intelligence Brief",
      action: () => { onNav("brief"); onClose(); } },
  ];

  const Row = ({ icon, iconColor, primary, secondary, right, onClick }) => (
    <div style={{
      padding: "9px 16px", display: "flex", alignItems: "center", gap: 12,
      cursor: "pointer", transition: "background .1s",
    }}
      onClick={onClick}
      onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface-3)"}
      onMouseLeave={ev => ev.currentTarget.style.background = ""}>
      <Icon name={icon} size={16} style={{ color: iconColor || "var(--text-dim)", flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: "var(--fs-sm)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{primary}</div>
        {secondary && <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", marginTop: 1 }}>{secondary}</div>}
      </div>
      {right}
    </div>
  );

  const SectionLabel = ({ label, count }) => (
    <div style={{ padding: "8px 16px 3px", fontSize: 10, textTransform: "uppercase",
      letterSpacing: "0.1em", color: "var(--text-mute)", fontFamily: "var(--font-mono)",
      display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      {count != null && <span>{count}</span>}
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 72,
    }} onClick={onClose}>
      <div style={{
        width: 600, maxHeight: "70vh",
        background: "var(--surface-2)", border: "1px solid var(--border-2)",
        borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)",
        display: "flex", flexDirection: "column",
      }} onClick={ev => ev.stopPropagation()}>

        {/* search input */}
        <div style={{ display: "flex", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid var(--border)", gap: 10 }}>
          <Icon name="search" size={17} style={{ color: "var(--text-dim)", flex: "none" }} />
          <input ref={inputRef} value={q} onChange={ev => setQ(ev.target.value)}
            placeholder={T("ค้นหาเรือ, เหตุการณ์, ข่าวกรอง...", "Search vessels, incidents, news...")}
            style={{ flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--text)", fontSize: 15, fontFamily: "var(--font-ui)" }} />
          <kbd style={{ fontSize: 10, color: "var(--text-mute)", padding: "2px 7px",
            borderRadius: 4, border: "1px solid var(--border-2)",
            fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>ESC</kbd>
        </div>

        {/* results */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Quick actions when empty */}
          {ql.length === 0 && (
            <div>
              <SectionLabel label={T("การดำเนินการด่วน", "Quick Actions")} />
              {quickActions.map((a, i) => (
                <Row key={i} icon={a.icon} primary={T(a.th, a.en)} onClick={a.action} />
              ))}
              <div style={{ padding: "8px 16px 10px", fontSize: "var(--fs-xs)",
                color: "var(--text-mute)", textAlign: "center" }}>
                {T("พิมพ์เพื่อค้นหาเรือ เหตุการณ์ หรือข่าวกรอง", "Type to search vessels, incidents, or intelligence")}
              </div>
            </div>
          )}

          {/* No results */}
          {ql.length >= 2 && !hasResults && (
            <div className="empty">{T("ไม่พบผลลัพธ์สำหรับ", "No results for")} "{q}"</div>
          )}

          {/* Vessels */}
          {vessels.length > 0 && (
            <div>
              <SectionLabel label={T("เรือ", "Vessels")} count={vessels.length} />
              {vessels.slice(0, 5).map(v => (
                <Row key={v.id}
                  icon="ship"
                  iconColor={window.VTYPE[v.type].color}
                  primary={v.name}
                  secondary={v.id + " · " + tx(window.VTYPE[v.type].label, lang) + " · " + v.flag}
                  right={
                    <span className={"badge " + (
                      v.status === "critical" ? "badge-crit" :
                      v.status === "watch" ? "badge-warn" :
                      v.status === "friendly" ? "badge-ok" : "badge-mute"
                    )}>{v.status.toUpperCase()}</span>
                  }
                  onClick={() => { onNav("map", { vessel: v }); onClose(); }}
                />
              ))}
            </div>
          )}

          {/* Incidents */}
          {events.length > 0 && (
            <div>
              <SectionLabel label={T("เหตุการณ์", "Incidents")} count={events.length} />
              {events.slice(0, 5).map(e => (
                <Row key={e.id}
                  icon="alert"
                  iconColor={window.SEV[e.sev].color}
                  primary={tx(e.title, lang)}
                  secondary={e.id + " · " + e.cat + " · " + tx(e.region, lang)}
                  right={<SevBadge sev={e.sev} lang={lang} />}
                  onClick={() => { onNav("incident", { id: e.id }); onClose(); }}
                />
              ))}
            </div>
          )}

          {/* News */}
          {news.length > 0 && (
            <div>
              <SectionLabel label={T("ข่าวกรอง OSINT", "OSINT Intelligence")} count={news.length} />
              {news.slice(0, 4).map(n => (
                <Row key={n.id}
                  icon="feed"
                  primary={tx(n.raw, lang)}
                  secondary={(n.outlet || "") + " · " + tx(n.ago, lang)}
                  onClick={() => { onNav("osint"); onClose(); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* footer hint */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 14, fontSize: "var(--fs-xs)", color: "var(--text-mute)" }}>
          <span><kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 4px",
            borderRadius: 3, border: "1px solid var(--border-2)" }}>↑↓</kbd> {T("เลือก", "navigate")}</span>
          <span><kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 4px",
            borderRadius: 3, border: "1px solid var(--border-2)" }}>↵</kbd> {T("เปิด", "open")}</span>
          <span><kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 4px",
            borderRadius: 3, border: "1px solid var(--border-2)" }}>ESC</kbd> {T("ปิด", "close")}</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SearchPalette });
