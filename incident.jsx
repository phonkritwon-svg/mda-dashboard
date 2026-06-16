/* ============================================================
   Screen: Incident Detail / Threat Assessment
   ============================================================ */
function Incident({ data, lang, onNav, initial, showToast }) {
  const T = (th, en) => lang === "th" ? th : en;
  const id = (initial && initial.id) || data.events[0].id;
  const e = data.events.find(x => x.id === id) || data.events[0];
  const v = e.vessel ? data.vessels.find(x => x.id === e.vessel) : null;
  const relatedNews = data.news.filter(n => n.linkedInc === e.id);
  const sevScore = { critical: 86, high: 64, medium: 42, low: 22 }[e.sev] || 22;
  const timeline = e.timeline || data.incTimeline;
  const recs = e.recs || data.recommendations;

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [escalated, setEscalated] = useState(false);
  const [tasked, setTasked] = useState(false);
  const [addOfficerOpen, setAddOfficerOpen] = useState(false);
  const [newOfficer, setNewOfficer] = useState({ rank: "น.ต.", firstName: "", lastName: "", role: "" });

  const fmtPos = (lat, lon) => {
    const la = Math.abs(lat).toFixed(1) + "°" + (lat >= 0 ? "N" : "S");
    const lo = Math.abs(lon).toFixed(1) + "°" + (lon >= 0 ? "E" : "W");
    return la + " " + lo;
  };

  const DEFAULT_OFFICERS = [
    { id: "O1", name: "น.ต. ธนาธร สุขชัย",   role: T("นักวิเคราะห์ข่าว", "Intel Analyst") },
    { id: "O2", name: "น.ต. วิมล ศรีรัตน์",   role: T("เจ้าหน้าที่เฝ้าระวัง", "Watch Officer") },
    { id: "O3", name: "พ.จ.อ. สมชาย บุญมี",   role: T("หัวหน้าชุดปฏิบัติการ", "Ops Team Lead") },
    { id: "O4", name: "น.ท. กฤษณา พลอยแก้ว", role: T("ผู้บังคับการชุด", "Duty OIC") },
  ];
  const [officers, setOfficers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mda_officers") || "null");
      return saved && saved.length ? saved : DEFAULT_OFFICERS;
    } catch (err) { return DEFAULT_OFFICERS; }
  });

  const saveOfficers = (list) => {
    setOfficers(list);
    try { localStorage.setItem("mda_officers", JSON.stringify(list)); } catch {}
  };

  const handleAddOfficer = () => {
    const { rank, firstName, lastName, role } = newOfficer;
    if (!firstName.trim() || !lastName.trim()) return;
    const fullName = rank + " " + firstName.trim() + " " + lastName.trim();
    const id = "O" + Date.now();
    const updated = [...officers, { id, name: fullName, role: role.trim() || T("เจ้าหน้าที่", "Officer") }];
    saveOfficers(updated);
    setNewOfficer({ rank: "น.ต.", firstName: "", lastName: "", role: "" });
    setAddOfficerOpen(false);
    if (showToast) showToast(T("เพิ่มเจ้าหน้าที่ " + fullName + " แล้ว", "Added officer " + fullName), "ok");
  };

  const handleRemoveOfficer = (id) => {
    const updated = officers.filter(o => o.id !== id);
    saveOfficers(updated);
    if (assignee === id) setAssignee("");
  };

  const handleAssign = () => {
    const officer = officers.find(o => o.id === assignee);
    if (!officer) return;
    setAssignOpen(false);
    setAssignee("");
    if (showToast) showToast(
      T("มอบหมาย " + e.id + " ให้ " + officer.name + " แล้ว",
        "Assigned " + e.id + " to " + officer.name), "ok"
    );
  };

  const handleEscalate = () => {
    setEscalated(true);
    if (showToast) showToast(
      T("ยกระดับ " + e.id + " เป็น CRITICAL — แจ้งเตือนผู้บังคับบัญชาแล้ว",
        "Escalated " + e.id + " to CRITICAL — command notified"), "warn"
    );
  };

  const handleTask = () => {
    setTasked(true);
    if (showToast) showToast(
      T("สั่งการปฏิบัติ " + e.id + " ส่งแล้ว — รอการยืนยันจากหน่วย",
        "Tasking for " + e.id + " sent — awaiting unit confirmation"), "info"
    );
  };

  const score = escalated ? 95 : sevScore;
  const sev   = escalated ? "critical" : e.sev;

  return (
    <div className="screen">

      {/* Assign Modal */}
      {assignOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setAssignOpen(false)}>
          <div style={{
            width: 400, background: "var(--surface-2)",
            border: "1px solid var(--border-2)", borderRadius: 12,
            overflow: "hidden", boxShadow: "var(--shadow)",
          }} onClick={ev => ev.stopPropagation()}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)",
              fontWeight: 600, display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="flag" size={15} style={{ color: "var(--accent)" }} />
              {T("มอบหมายเหตุการณ์", "Assign Incident")} — {e.id}
            </div>
            <div style={{ padding: 16, maxHeight: "60vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div className="dim" style={{ fontSize: "var(--fs-sm)" }}>
                  {T("เลือกเจ้าหน้าที่รับผิดชอบ", "Select responsible officer")}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ gap: 5 }}
                  onClick={() => setAddOfficerOpen(o => !o)}>
                  <Icon name="plus" size={13} />{T("เพิ่มเจ้าหน้าที่", "Add Officer")}
                </button>
              </div>

              {/* Add Officer Form */}
              {addOfficerOpen && (
                <div style={{
                  padding: "12px 14px", marginBottom: 12, borderRadius: 8,
                  background: "rgba(var(--accent-rgb),0.05)",
                  border: "1px solid rgba(var(--accent-rgb),0.2)",
                }}>
                  <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--accent)",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                    {T("เพิ่มเจ้าหน้าที่ใหม่", "New Officer")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 7, marginBottom: 7 }}>
                    <select value={newOfficer.rank}
                      onChange={e => setNewOfficer(o => ({ ...o, rank: e.target.value }))}
                      style={{
                        background: "var(--surface)", border: "1px solid var(--border-2)",
                        borderRadius: 6, padding: "6px 8px", color: "var(--text)",
                        fontFamily: "var(--font-ui)", fontSize: "var(--fs-xs)",
                      }}>
                      {["พล.ร.อ.","พล.ร.ท.","พล.ร.ต.","น.อ.","น.ท.","น.ต.","ร.อ.","ร.ท.","ร.ต.",
                        "พ.จ.อ.","จ.อ.","จ.ต."].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input placeholder={T("ชื่อ", "First name")} value={newOfficer.firstName}
                      onChange={e => setNewOfficer(o => ({ ...o, firstName: e.target.value }))}
                      style={{ background: "var(--surface)", border: "1px solid var(--border-2)",
                        borderRadius: 6, padding: "6px 8px", color: "var(--text)",
                        fontFamily: "var(--font-ui)", fontSize: "var(--fs-xs)", outline: "none" }} />
                    <input placeholder={T("นามสกุล", "Last name")} value={newOfficer.lastName}
                      onChange={e => setNewOfficer(o => ({ ...o, lastName: e.target.value }))}
                      style={{ background: "var(--surface)", border: "1px solid var(--border-2)",
                        borderRadius: 6, padding: "6px 8px", color: "var(--text)",
                        fontFamily: "var(--font-ui)", fontSize: "var(--fs-xs)", outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <input placeholder={T("ตำแหน่ง เช่น นักวิเคราะห์ข่าว", "Role e.g. Intel Analyst")} value={newOfficer.role}
                      onChange={e => setNewOfficer(o => ({ ...o, role: e.target.value }))}
                      style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border-2)",
                        borderRadius: 6, padding: "6px 8px", color: "var(--text)",
                        fontFamily: "var(--font-ui)", fontSize: "var(--fs-xs)", outline: "none" }} />
                    <button className="btn btn-primary btn-sm"
                      style={{ opacity: newOfficer.firstName && newOfficer.lastName ? 1 : 0.45 }}
                      onClick={handleAddOfficer}>
                      <Icon name="check" size={13} />{T("บันทึก", "Save")}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAddOfficerOpen(false)}>
                      {T("ยกเลิก", "Cancel")}
                    </button>
                  </div>
                </div>
              )}

              {officers.map(o => (
                <div key={o.id}
                  style={{
                    padding: "10px 12px", borderRadius: 8, marginBottom: 7, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    border: "1px solid " + (assignee === o.id ? "var(--accent)" : "var(--border)"),
                    background: assignee === o.id ? "rgba(var(--accent-rgb),0.07)" : "var(--surface)",
                    transition: "all .12s",
                  }}
                  onClick={() => setAssignee(o.id)}>
                  <div className="avatar" style={{ width: 34, height: 34, fontSize: 12, flexShrink: 0 }}>
                    {o.name.charAt(o.name.lastIndexOf(" ") + 1) || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "var(--fs-sm)" }}>{o.name}</div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>{o.role}</div>
                  </div>
                  {assignee === o.id
                    ? <Icon name="check" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    : !o.id.startsWith("O") ? null : (
                      <span style={{ fontSize: 16, cursor: "pointer", color: "var(--text-mute)", flexShrink: 0, lineHeight: 1 }}
                        onClick={ev => { ev.stopPropagation(); handleRemoveOfficer(o.id); }}
                        title={T("ลบเจ้าหน้าที่", "Remove officer")}>×</span>
                    )
                  }
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)",
              display: "flex", gap: 9, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setAssignOpen(false); setAddOfficerOpen(false); }}>
                {T("ยกเลิก", "Cancel")}
              </button>
              <button className="btn btn-primary btn-sm"
                style={{ opacity: assignee ? 1 : 0.5 }}
                onClick={handleAssign}>
                <Icon name="check" size={13} />{T("ยืนยันมอบหมาย", "Confirm Assignment")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* breadcrumb */}
      <div className="row" style={{
        gap: 10, marginBottom: 12, cursor: "pointer",
        color: "var(--text-dim)", fontSize: "var(--fs-sm)",
      }} onClick={() => onNav("map")}>
        <Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />
        {T("กลับไปแผนที่เหตุการณ์", "Back to map & events")}
      </div>

      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 5 }}>
            <SevBadge sev={sev} lang={lang} />
            <span className="badge badge-mute mono">{e.id}</span>
            <span className="tag mono">{e.cat}</span>
            {e.resolved && <Badge kind="ok" dot>{T("ปิดเหตุแล้ว", "RESOLVED")}</Badge>}
            {escalated && <Badge kind="crit" dot>{T("ยกระดับแล้ว", "ESCALATED")}</Badge>}
          </div>
          <div className="page-title" style={{ maxWidth: 760 }}>{tx(e.title, lang)}</div>
          <div className="page-sub row" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 5 }}>
              <Icon name="pin" size={13} />{tx(e.area, lang)}
            </span>
            <span className="row" style={{ gap: 5 }}>
              <Icon name="clock" size={13} />
              {T("รายงานเมื่อ", "Reported")} {e.time} ({tx(e.ago, lang)} {T("ที่แล้ว", "ago")})
            </span>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => setAssignOpen(true)}>
            <Icon name="flag" size={14} />{T("มอบหมาย", "Assign")}
          </button>
          <button
            className={"btn btn-sm " + (escalated ? "btn-ghost" : "btn-primary")}
            onClick={escalated ? null : handleEscalate}
            style={{ opacity: escalated ? 0.6 : 1 }}>
            <Icon name="shield" size={14} />
            {escalated ? T("ยกระดับแล้ว", "Escalated") : T("ยกระดับ", "Escalate")}
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>

        {/* LEFT */}
        <div className="col" style={{ gap: 12 }}>
          <Panel title={T("บทสรุปจาก AI", "AI Assessment")} icon="spark"
            action={<span className="ai-chip"><Icon name="cpu" size={12} />GPT-fusion</span>}>
            <div className="nsum" style={{ color: "var(--text)", fontSize: "var(--fs-base)", lineHeight: 1.7 }}>
              {tx(e.summary, lang)}
            </div>
            <div className="divider"></div>
            <div className="row wrap" style={{ gap: 6 }}>
              {e.tags.map(tg => <span key={tg} className="tag">{tg}</span>)}
            </div>
            <div className="row" style={{ gap: 16, marginTop: 14 }}>
              <div className="col" style={{ gap: 4 }}>
                <span className="dim up" style={{ fontSize: 9 }}>{T("ความเชื่อมั่น AI", "AI confidence")}</span>
                <Confidence value={e.conf} />
              </div>
              <div className="col" style={{ gap: 4 }}>
                <span className="dim up" style={{ fontSize: 9 }}>{T("แหล่งยืนยัน", "Corroborating sources")}</span>
                <span className="mono" style={{ fontSize: 15 }}>{relatedNews.length + 1}</span>
              </div>
            </div>
          </Panel>

          <Panel title={T("ลำดับเหตุการณ์", "Incident Timeline")} icon="clock">
            <div className="timeline">
              {timeline.map((tl, i) => (
                <div className="tl-item" key={i}>
                  <div className={"tl-dot " + tl.lvl}></div>
                  <div className="tl-time">{tl.time}</div>
                  <div className="tl-desc" style={{ color: "var(--text)", marginTop: 2 }}>
                    {tx(tl, lang)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={T("ข่าวกรองที่เกี่ยวข้อง", "Related OSINT")} icon="feed" flush
            action={
              <a className="panel-link" onClick={() => onNav("osint")}>
                {T("ดูฟีด", "Open feed")}<Icon name="chevR" size={12} />
              </a>
            }>
            <div className="feed">
              {relatedNews.length ? relatedNews.map(n => (
                <div key={n.id} className="feed-row news-row" style={{ cursor: "pointer" }}
                  onClick={() => onNav("osint")}>
                  <div className="nhead">
                    <SrcChip srcKey={n.srcKey} withName lang={lang} />
                    <span className="tag mono">{n.reliability}{n.credibility}</span>
                    <span className="topbar-spacer"></span>
                    <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>{n.time}</span>
                  </div>
                  <div className="nsum">{tx(n.raw, lang)}</div>
                </div>
              )) : (
                <div className="empty">{T("ยังไม่มีข่าวที่เชื่อมโยง", "No linked OSINT yet")}</div>
              )}
            </div>
          </Panel>
        </div>

        {/* RIGHT */}
        <div className="col" style={{ gap: 12 }}>
          <Panel title={T("ระดับภัยคุกคาม", "Threat Level")} icon="shield">
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              <Gauge value={score} label={T("คะแนน", "SCORE")} color={window.SEV[sev].color} />
              <div className="col" style={{ gap: 8, flex: 1 }}>
                <SevBadge sev={sev} lang={lang} />
                <div className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span className="k">{T("ผลกระทบ", "Impact")}</span>
                  <span className="v">{sev === "critical" ? "High" : "Med"}</span>
                  <span className="k">{T("ความเร่งด่วน", "Urgency")}</span>
                  <span className="v">{e.resolved ? "Low" : "High"}</span>
                  <span className="k">{T("โอกาสเกิด", "Likelihood")}</span>
                  <span className="v">{e.conf >= 4 ? "High" : "Med"}</span>
                </div>
              </div>
            </div>
            <div className="divider"></div>
            <ThreatMeter value={score} lang={lang} />
          </Panel>

          {v && (
            <Panel title={T("เรือเป้าหมาย", "Subject Vessel")} icon="ship"
              action={
                <a className="panel-link" onClick={() => onNav("map", { vessel: v })}>
                  {T("ดูบนแผนที่", "On map")}<Icon name="pin" size={12} />
                </a>
              }>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>{v.name}</span>
                <span className="badge badge-mute mono">{v.id}</span>
              </div>
              <div className="kv">
                <span className="k">{T("ประเภท", "Type")}</span>
                <span className="v" style={{ color: window.VTYPE[v.type].color }}>
                  {tx(window.VTYPE[v.type].label, lang)}
                </span>
                <span className="k">{T("ธง", "Flag")}</span>
                <span className="v">{v.flag}</span>
                <span className="k">{T("ความเร็ว / เข็ม", "Speed / Course")}</span>
                <span className="v">{v.sp} kn · {v.course}°</span>
                <span className="k">{T("พิกัด", "Position")}</span>
                <span className="v">{fmtPos(e.lat, e.lon)}</span>
              </div>
              {v.note && (
                <div style={{ marginTop: 9, padding: "7px 9px", borderRadius: 6,
                  background: "rgba(var(--crit-rgb),0.1)",
                  border: "1px solid rgba(var(--crit-rgb),0.25)",
                  fontSize: "var(--fs-xs)", color: "var(--crit)" }}>
                  <Icon name="alert" size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {tx(v.note, lang)}
                </div>
              )}
            </Panel>
          )}

          <Panel title={T("ข้อเสนอแนะการปฏิบัติ", "Recommended Actions")} icon="target">
            <div className="col" style={{ gap: 9 }}>
              {recs.map((r, i) => (
                <div key={i} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                  <span style={{
                    flex: "none", width: 18, height: 18, borderRadius: 5,
                    background: "rgba(var(--accent-rgb),0.14)", color: "var(--accent)",
                    display: "grid", placeItems: "center",
                    fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)",
                  }}>{i + 1}</span>
                  <span style={{ fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>{tx(r, lang)}</span>
                </div>
              ))}
            </div>
            <button
              className={"btn btn-sm " + (tasked ? "btn-ghost" : "btn-primary")}
              style={{ width: "100%", marginTop: 12, opacity: tasked ? 0.7 : 1 }}
              onClick={tasked ? null : handleTask}>
              <Icon name={tasked ? "check" : "target"} size={14} />
              {tasked ? T("ส่งคำสั่งแล้ว", "Tasking Sent") : T("สั่งการปฏิบัติ", "Task an asset")}
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Incident });
