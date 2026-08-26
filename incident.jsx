/* ============================================================
   Screen: Incident Detail / Threat Assessment
   ============================================================ */
function Incident({ data, lang, onNav, initial, showToast, addEvent, currentUser }) {
  const T = (th, en) => lang === "th" ? th : en;

  /* สิทธิ์สั่งการ — คุมสองปุ่มพร้อมกัน: มอบหมาย · ยกระดับ
     ได้แก่ admin, ผู้บัญชาการ และยศชั้นสัญญาบัตร (ร.ต. ขึ้นไป)

     ซ่อนปุ่มเฉย ๆ ไม่ใช่การบังคับสิทธิ์ ตัวบังคับจริงอยู่ที่ RLS ฝั่ง Supabase
     (ดู supabase/roles.sql) ที่นี่แค่ไม่ยื่นปุ่มที่กดไปก็ไม่ผ่านให้เกะกะ */
  const canAct = window.can(currentUser, "command");

  /* ป้ายแทนปุ่มเมื่อยศไม่ถึง — ใช้ข้อความเดียวกันทั้งสองจุด
     ถ้าเขียนแยกกัน วันที่เงื่อนไขเปลี่ยนจะแก้ไม่ครบแล้วผู้ใช้เจอคำอธิบาย
     ที่ขัดกันเองในหน้าเดียว */
  const RankDenied = ({ icon, block }) => (
    <span className="dim"
      title={T("สั่งการได้เฉพาะผู้ดูแลระบบ ผู้บัญชาการ หรือยศชั้นสัญญาบัตร (ร.ต. ขึ้นไป)",
               "Limited to administrators, commanders, and commissioned ranks (ร.ต. and above)")}
      style={{
        fontSize: "var(--fs-xs)", display: "flex", alignItems: "center", gap: 6,
        ...(block ? { justifyContent: "center", width: "100%", marginTop: 12,
                      padding: "8px 0", border: "1px dashed var(--border-2)",
                      borderRadius: 7, boxSizing: "border-box" } : {}),
      }}>
      <Icon name={icon} size={13} style={{ opacity: 0.45 }} />
      {T("ยศของคุณไม่ตรงกับเงื่อนไข", "Your rank does not meet the requirement")}
    </span>
  );

  /* เหตุการณ์ที่กำลังดู — คำนวณแบบทนค่าว่างได้ เพราะ hook ทั้งหมดต้องถูกเรียก
     ก่อนถึง early return ของ empty state เสมอ
     data.events โตขึ้นแบบอะซิงก์ (Supabase + เหตุการณ์ที่อนุมานจากฟีดข่าว)
     ถ้า return ก่อนเรียก hook เหมือนเดิม พอข่าวชุดแรกมาถึงขณะเปิดหน้านี้ค้างไว้
     จำนวน hook จะเปลี่ยนจาก 0 เป็น 6 กลางคัน React จะโยน
     "Rendered more hooks than during the previous render" แล้วจอขาว        */
  const events = (data.events && data.events.length) ? data.events : null;
  const id = events ? ((initial && initial.id) || events[0].id) : null;
  const e = events ? (events.find(x => x.id === id) || events[0]) : null;
  const idx = events ? Math.max(0, events.findIndex(x => x.id === e.id)) : 0;

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [escalated, setEscalated] = useState(false);
  const [escalatedBy, setEscalatedBy] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");

  /* สถานะผูกกับเหตุการณ์ที่กำลังดู ไม่ใช่กับหน้าจอ — ไม่ตั้งใหม่ทุกครั้งที่สลับ
     ป้าย "ยกระดับแล้ว" กับผู้รับมอบหมายจะติดค้างไปยังเหตุการณ์ถัดไป

     ค่าเริ่มต้นมาจากเหตุการณ์ ไม่ใช่ false เสมอ — สถานะยกระดับถูกเก็บใน
     Supabase แล้ว (escalated_at/escalated_by) จึงต้องอ่านกลับมาแสดง
     ไม่งั้นรีเฟรชแล้วปุ่มจะขึ้นว่ายังไม่ยกระดับทั้งที่ในฐานข้อมูลยกระดับอยู่ */
  React.useEffect(() => {
    setEscalated(!!(e && e.escalatedAt));
    setEscalatedBy((e && e.escalatedBy) || "");
    setAssignee("");
    setAssignOpen(false);
  }, [e && e.id, e && e.escalatedAt, e && e.escalatedBy]);


  /* หน่วยงานกองทัพเรือ — มาจาก navy-units.js (ดึงจาก navy.mi.th/organization)
     ไม่ใช่รายชื่อที่แก้ในหน้าเว็บได้อีกแล้ว เพราะปลายทางเป็นอีเมลราชการจริง
     ถ้าให้เพิ่มเองได้ จะมีคนพิมพ์อีเมลผิดแล้วส่งหนังสือราชการไปผิดที่ */
  const unitGroups = window.MDA_NAVY_UNITS || [];
  const unitsFlat  = window.MDA_NAVY_UNITS_FLAT || [];

  /* ค้นหาแบบไม่สนตัวพิมพ์ ค้นได้ทั้งชื่อหน่วย ชื่อหมวด และอีเมล
     ค้นด้วยอีเมลมีประโยชน์จริงเวลารู้ปลายทางแต่จำชื่อหน่วยเต็มไม่ได้ */
  const visibleGroups = (() => {
    const q = unitQuery.trim().toLowerCase();
    if (!q) return unitGroups;
    return unitGroups
      .map(g => ({
        cat: g.cat,
        units: g.units.filter(u =>
          (u.name + " " + g.cat + " " + u.email).toLowerCase().indexOf(q) >= 0),
      }))
      .filter(g => g.units.length);
  })();

  const selectedUnit = unitsFlat.find(u => u.email && u.email === assignee) || null;

  // ยังไม่มีเหตุการณ์ในฐานข้อมูล → empty state + ปุ่มเพิ่ม
  if (!events) {
    return (
      <div className="screen">
        <div className="page-head">
          <div>
            <div className="eyebrow">{T("เหตุการณ์ / การประเมินภัย", "Incidents / Threat Assessment")}</div>
            <div className="page-title">{T("ยังไม่มีเหตุการณ์", "No events yet")}</div>
            <div className="page-sub">{T("เหตุการณ์จะถูกสร้างอัตโนมัติจากข่าวภัยสูง หรือเพิ่มเองด้านล่าง", "Events are auto-generated from high-severity news, or add one below.")}</div>
          </div>
          {window.AddEventButton && <window.AddEventButton addEvent={addEvent} lang={lang} showToast={showToast} currentUser={currentUser} />}
        </div>
        <div className="empty" style={{ marginTop: 40 }}>
          <Icon name="alert" size={32} style={{ color: "var(--text-mute)", marginBottom: 10 }} />
          <div>{T("ไม่มีเหตุการณ์ที่ต้องเฝ้าระวังในขณะนี้", "No active incidents at this time")}</div>
        </div>
      </div>
    );
  }

  const go = (i) => {
    const t = events[Math.max(0, Math.min(events.length - 1, i))];
    if (t && t.id !== e.id) onNav("incident", { id: t.id });
  };
  const v = e.vessel ? data.vessels.find(x => x.id === e.vessel) : null;
  const relatedNews = data.news.filter(n => n.linkedInc === e.id);
  const sevScore = { critical: 86, high: 64, medium: 42, low: 22 }[e.sev] || 22;
  const timeline = e.timeline || data.incTimeline;
  const recs = e.recs || data.recommendations;

  const fmtPos = (lat, lon) => {
    const la = Math.abs(lat).toFixed(1) + "°" + (lat >= 0 ? "N" : "S");
    const lo = Math.abs(lon).toFixed(1) + "°" + (lon >= 0 ? "E" : "W");
    return la + " " + lo;
  };

  /* ร่างอีเมลมอบหมายแล้วเปิดโปรแกรมเมลของผู้ใช้ — ไม่ได้ส่งเอง

     จงใจใช้ mailto: ไม่ใช่การยิง API ส่งเมลจากเซิร์ฟเวอร์ เพราะปลายทาง
     เป็นตู้จดหมายราชการจริงของกองทัพเรือ การกดผิดหนึ่งครั้งแล้วจดหมาย
     ออกไปทันทีเรียกคืนไม่ได้ วิธีนี้ผู้ใช้ได้เห็นและกดส่งเองเสมอ
     และไม่ต้องเก็บคีย์ผู้ให้บริการเมลไว้ที่ไหนเลย */
  const buildAssignMail = (unit) => {
    const subject = "[MDA] มอบหมายเหตุการณ์ " + e.id + " — " + tx(e.title, "th");
    const pos = (e.lat != null && e.lon != null) ? fmtPos(e.lat, e.lon) : "-";
    const me  = currentUser
      ? [currentUser.rank, currentUser.name].filter(Boolean).join(" ")
      : "";
    const lines = [
      "เรียน " + unit.name,
      "",
      "ขอส่งเหตุการณ์จากระบบเฝ้าระวังทางทะเล (MDA) เพื่อโปรดพิจารณาดำเนินการ",
      "",
      "รหัสเหตุการณ์ : " + e.id,
      "หัวข้อ        : " + tx(e.title, "th"),
      "ระดับความรุนแรง: " + String(e.sev || "").toUpperCase(),
      "พื้นที่        : " + [tx(e.area, "th"), tx(e.region, "th")].filter(Boolean).join(" / "),
      "พิกัด         : " + pos,
      "เวลา          : " + (e.time || "-"),
      "",
      "สรุป:",
      tx(e.summary, "th") || "-",
    ];
    if (e.source && e.source.url) {
      lines.push("", "แหล่งข่าว: " + (e.source.outlet || "") + " " + e.source.url);
    }
    lines.push("", "ส่งจากระบบ MDA · ศูนย์บัญชาการข่าวทางทะเล");
    if (me) lines.push("ผู้มอบหมาย: " + me);

    return "mailto:" + encodeURIComponent(unit.email)
      + "?subject=" + encodeURIComponent(subject)
      + "&body=" + encodeURIComponent(lines.join("\n"));
  };

  const handleAssign = () => {
    const unit = unitsFlat.find(u => u.email === assignee);
    if (!unit || !unit.email) return;
    /* เปิดในแท็บเดียวกันด้วย location.href — window.open() ถูก popup blocker
       กินบ่อยเมื่อมี await คั่นก่อนหน้า ส่วน mailto: ไม่ทำให้หน้าเว็บถูกทิ้ง
       เบราว์เซอร์แค่ส่งต่อให้โปรแกรมเมล หน้าเดิมยังอยู่ */
    window.location.href = buildAssignMail(unit);
    setAssignOpen(false);
    setAssignee("");
    if (showToast) showToast(
      T("ร่างอีเมลถึง " + unit.name + " แล้ว — ตรวจแล้วกดส่งในโปรแกรมเมล",
        "Drafted an email to " + unit.name + " — review and send it in your mail app"), "ok"
    );
  };

  /* ชื่อผู้กด — ยศนำหน้าชื่อเต็ม เช่น "น.ท. สมชาย ใจดี"
     ถ้าโปรไฟล์ไม่มีชื่อจริงจะเหลือแค่ยศ หรือว่างเปล่า ต้องทนได้ทั้งสองแบบ */
  const actorName = currentUser
    ? [currentUser.rank, currentUser.name].filter(Boolean).join(" ")
    : "";

  /* ยกระดับเป็นปุ่มสลับแบบปักหมุด กดซ้ำเพื่อถอนได้
     เดิมกดแล้วกดกลับไม่ได้เลย ซึ่งแปลว่ากดพลาดครั้งเดียวก็ค้างเป็น CRITICAL
     ตลอดจนกว่าจะสลับเหตุการณ์ทิ้ง */
  /* เขียนลง Supabase ก่อน แล้วค่อยอัปเดตหน้าจอตามผลจริง
     ไม่ใช้ optimistic update เพราะถ้าเขียนไม่ผ่าน (สิทธิ์ไม่ถึง เน็ตหลุด)
     ปุ่มจะแสดงว่ายกระดับแล้วทั้งที่ฐานข้อมูลไม่รู้เรื่อง — คนอื่นเปิดมาไม่เห็น
     แล้วคนกดก็เข้าใจว่าแจ้งไปแล้ว ซึ่งอันตรายกว่าปุ่มที่ช้าไปครึ่งวินาที */
  const handleEscalate = async () => {
    if (escalating) return;                 // กันกดรัวจนส่งซ้ำ
    const turningOff = escalated;
    setEscalating(true);
    const res = await window.setEventEscalation(e.id, turningOff ? "" : actorName);
    setEscalating(false);

    if (res.error) {
      if (showToast) showToast(res.error, "error");
      return;
    }
    if (turningOff) {
      setEscalated(false);
      setEscalatedBy("");
      if (showToast) showToast(
        T("ถอนการยกระดับ " + e.id + " แล้ว", "Removed the escalation on " + e.id), "info");
      return;
    }
    setEscalated(true);
    setEscalatedBy(actorName);
    if (showToast) showToast(
      T("ยกระดับแล้วโดย " + (actorName || "ผู้ใช้"),
        "Escalated by " + (actorName || "user")), "warn");
  };

  const score = escalated ? 95 : sevScore;
  const sev   = escalated ? "critical" : e.sev;

  return (
    <div className="screen">

      {/* Assign Modal */}
      {assignOpen && (
        <div style={{
          // 920: เหนือแผนที่เต็มจอ (890) · ต่ำกว่า Toast (999)
          position: "fixed", inset: 0, zIndex: 920,
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
              <div className="dim" style={{ fontSize: "var(--fs-sm)", marginBottom: 10 }}>
                {T("เลือกหน่วยงานที่รับผิดชอบ — ระบบจะร่างอีเมลให้ตรวจก่อนส่ง",
                   "Choose the responsible unit — an email draft opens for you to review")}
              </div>

              <input value={unitQuery} onChange={ev => setUnitQuery(ev.target.value)}
                placeholder={T("ค้นหาหน่วยงาน…", "Search units…")}
                style={{
                  width: "100%", boxSizing: "border-box", marginBottom: 12,
                  background: "var(--surface)", border: "1px solid var(--border-2)",
                  borderRadius: 7, padding: "8px 11px", color: "var(--text)",
                  fontFamily: "var(--font-ui)", fontSize: "var(--fs-sm)", outline: "none",
                }} />

              {visibleGroups.length === 0 && (
                <div className="empty" style={{ padding: "18px 0" }}>
                  {T("ไม่พบหน่วยงานที่ตรงกับคำค้น", "No unit matches that search")}
                </div>
              )}

              {visibleGroups.map(g => (
                <div key={g.cat} style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)",
                    padding: "0 2px 6px",
                  }}>{g.cat}</div>

                  {g.units.map(u => {
                    const selectable = !!u.email;
                    const on = selectable && assignee === u.email;
                    return (
                      <div key={g.cat + "|" + u.name}
                        /* navy-units.js เก็บเฉพาะหน่วยที่มีอีเมลแล้ว สาขา
                           selectable=false จึงไม่ควรเกิด — เก็บไว้เป็นตาข่าย
                           เผื่อมีคนแก้ไฟล์ข้อมูลแล้วใส่หน่วยที่ไม่มีอีเมลเข้ามา
                           ดีกว่าปล่อยให้สร้าง mailto: ที่ไม่มีผู้รับ */
                        title={selectable ? u.email
                          : T("หน่วยงานนี้ไม่ได้เผยแพร่อีเมลไว้บนเว็บกองทัพเรือ",
                              "This unit publishes no email address")}
                        style={{
                          padding: "9px 11px", borderRadius: 8, marginBottom: 6,
                          display: "flex", alignItems: "center", gap: 10,
                          cursor: selectable ? "pointer" : "not-allowed",
                          opacity: selectable ? 1 : 0.45,
                          border: "1px solid " + (on ? "var(--accent)" : "var(--border)"),
                          background: on ? "rgba(var(--accent-rgb),0.07)" : "var(--surface)",
                          transition: "all .12s",
                        }}
                        onClick={() => { if (selectable) setAssignee(u.email); }}>
                        <Icon name="shield" size={15}
                          style={{ flexShrink: 0, color: on ? "var(--accent)" : "var(--text-mute)" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: "var(--fs-sm)" }}>{u.name}</div>
                          <div style={{
                            fontSize: "var(--fs-xs)", color: "var(--text-dim)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {u.email || T("ไม่มีอีเมลเผยแพร่", "no published email")}
                            {u.suspect && " ⚠"}
                          </div>
                        </div>
                        {on && <Icon name="check" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
              ))}

              {selectedUnit && selectedUnit.suspect && (
                <div style={{
                  padding: "9px 12px", borderRadius: 7, marginTop: 4,
                  background: "rgba(var(--crit-rgb),0.1)",
                  border: "1px solid rgba(var(--crit-rgb),0.3)",
                  color: "var(--crit)", fontSize: "var(--fs-xs)", lineHeight: 1.6,
                }}>
                  {T("อีเมลของหน่วยงานนี้ไม่ใช่โดเมน navy.mi.th และมีลักษณะผิดปกติ " +
                     "ตามที่เว็บกองทัพเรือเผยแพร่ไว้ — ควรยืนยันกับหน่วยงานก่อนส่ง",
                     "This address is not on navy.mi.th and looks irregular as published " +
                     "by the navy site — confirm with the unit before sending")}
                </div>
              )}
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)",
              display: "flex", gap: 9, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAssignOpen(false)}>
                {T("ยกเลิก", "Cancel")}
              </button>
              <button className="btn btn-primary btn-sm"
                style={{ opacity: assignee ? 1 : 0.5 }}
                onClick={handleAssign}>
                <Icon name="flag" size={13} />{T("ร่างอีเมลมอบหมาย", "Draft assignment email")}
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

      {/* ── แถบสลับเหตุการณ์ ──────────────────────────────────────
          เดิมหน้านี้แสดงเหตุการณ์เดียวแล้วจบ ต้องถอยไปหน้าอื่นเพื่อเปลี่ยนเรื่อง
          ทั้งที่การเฝ้าระวังคือการกวาดดูทีละเหตุการณ์ต่อเนื่อง            */}
      {events.length > 1 && (
        <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" disabled={idx <= 0}
            onClick={() => go(idx - 1)} title={T("เหตุการณ์ก่อนหน้า", "Previous incident")}>
            <Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span className="mono dim" style={{ fontSize: "var(--fs-sm)", minWidth: 52, textAlign: "center" }}>
            {idx + 1} / {events.length}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={idx >= events.length - 1}
            onClick={() => go(idx + 1)} title={T("เหตุการณ์ถัดไป", "Next incident")}>
            <Icon name="chevR" size={14} />
          </button>

          {/* รายการทั้งหมด — เรียงตามความรุนแรงเหมือนที่อื่น กดข้ามไปตัวไหนก็ได้ */}
          <div className="row" style={{ gap: 6, overflowX: "auto", flex: 1, paddingBottom: 2 }}>
            {events.map((ev, i) => {
              const active = ev.id === e.id;
              const col = (window.SEV[ev.sev] || window.SEV.low).color;
              return (
                <button key={ev.id} onClick={() => go(i)} title={tx(ev.title, lang)}
                  className="btn btn-sm"
                  style={{
                    flex: "0 0 auto", maxWidth: 190, whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                    borderColor: active ? col : "var(--border-2)",
                    background: active ? "color-mix(in srgb, " + col + " 14%, transparent)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-dim)",
                  }}>
                  <span style={{
                    display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                    background: col, marginRight: 6, verticalAlign: "middle",
                  }} />
                  {/* ใช้พาดหัว ไม่ใช่ชื่อพื้นที่ — หลายเหตุการณ์อยู่พื้นที่เดียวกัน
                      ป้ายจะซ้ำจนแยกไม่ออกว่าอันไหนคืออันไหน */}
                  {tx(ev.title, lang)}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
            {/* ลิงก์ข่าวต้นฉบับ — เหตุการณ์เกือบทั้งหมดอนุมานมาจากข่าวและพก
                source.url มาด้วยอยู่แล้ว แต่หน้านี้ไม่เคยแสดงเลย ผู้ใช้จึง
                ตรวจสอบที่มาไม่ได้ ซึ่งขัดกับหลักของแดชบอร์ดทั้งระบบ */}
            {e.source && e.source.url && (
              <a className="row" style={{ gap: 5, color: "var(--accent)" }}
                href={e.source.url} target="_blank" rel="noopener noreferrer"
                title={T("เปิดข่าวต้นฉบับในแท็บใหม่", "Open the original article in a new tab")}>
                <Icon name="link" size={13} />
                {T("ข่าวต้นฉบับ", "Original article")}
                {e.source.outlet ? " · " + e.source.outlet : ""}
              </a>
            )}
          </div>
        </div>
        <div className="row">
          {canAct ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setAssignOpen(true)}>
              <Icon name="flag" size={14} />{T("มอบหมาย", "Assign")}
            </button>
          ) : <RankDenied icon="flag" />}

          {canAct ? (
            <button
              className={"btn btn-sm " + (escalated ? "btn-primary" : "btn-ghost")}
              onClick={handleEscalate}
              disabled={escalating}
              style={{ opacity: escalating ? 0.6 : 1 }}
              title={escalated
                ? T("กดอีกครั้งเพื่อถอนการยกระดับ", "Click again to remove the escalation")
                : T("ยกระดับเหตุการณ์เป็น CRITICAL", "Raise this incident to CRITICAL")}>
              <Icon name="pin" size={14} />
              {escalated
                ? T("ยกระดับแล้วโดย " + (escalatedBy || "ผู้ใช้"),
                    "Escalated by " + (escalatedBy || "user"))
                : T("ยกระดับ", "Escalate")}
            </button>
          ) : <RankDenied icon="shield" />}
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
              {/* ข่าวที่เหตุการณ์นี้ถูกสร้างขึ้นมาจาก — ต้องมาก่อนเสมอ
                  เดิมแผงนี้อ่านจาก linkedInc อย่างเดียว ซึ่งเลิกใช้ไปพร้อมกับ
                  การถอดเหตุการณ์สมมติออก จึงขึ้น "ยังไม่มีข่าวที่เชื่อมโยง"
                  แทบทุกครั้ง ทั้งที่ต้นทางของเหตุการณ์อยู่ในมือแล้ว */}
              {e.source && e.source.url && (
                <a className="feed-row news-row" style={{ display: "block", cursor: "pointer" }}
                  href={e.source.url} target="_blank" rel="noopener noreferrer">
                  <div className="nhead">
                    {e.srcKey && <SrcChip srcKey={e.srcKey} withName lang={lang} />}
                    <Badge kind="ok">{T("ต้นทางเหตุการณ์", "Origin")}</Badge>
                    <span className="topbar-spacer"></span>
                    <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>
                      {e.source.outlet || ""}
                    </span>
                  </div>
                  <div className="nsum">{tx(e.title, lang)}</div>
                  <div className="dim row" style={{ gap: 5, fontSize: "var(--fs-xs)", marginTop: 4 }}>
                    <Icon name="link" size={12} />{T("เปิดข่าวต้นฉบับ", "Open original article")}
                  </div>
                </a>
              )}

              {relatedNews.map(n => (
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
              ))}

              {!relatedNews.length && !(e.source && e.source.url) && (
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
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Incident });
