/* ============================================================
   กล่องข้อความ — การมอบหมายเหตุการณ์ถึงผู้ใช้ในระบบ

   แทนที่การร่างอีเมลส่งออกไปหาหน่วยงานภายนอก ข้อดีที่ได้กลับมาคือ
   รู้ว่าใครอ่านแล้วหรือยัง ซึ่งอีเมลออกข้างนอกไม่มีทางรู้

   ⚠ สิทธิ์บังคับจริงอยู่ที่ RLS ใน supabase/assignments.sql:
     ส่งได้เฉพาะคนที่ can_command() และต้องส่งในนามตัวเอง
     อ่านได้เฉพาะกล่องของตัวเองกับสิ่งที่ตัวเองส่ง
     แก้ได้เฉพาะ read_at (trigger กันคอลัมน์อื่นไว้)
   ============================================================ */

/* ── ชั้นข้อมูล ─────────────────────────────────────────────── */

async function sendAssignment(payload) {
  const SB = window.MDA_SB;
  if (!SB) return { error: "no_supabase" };
  try {
    const { error } = await SB.from("assignments").insert({
      event_id:    payload.eventId,
      to_id:       payload.toId,
      from_id:     payload.fromId,
      to_name:     payload.toName || null,
      from_name:   payload.fromName || null,
      event_title: payload.eventTitle || null,
      event_sev:   payload.eventSev || null,
      note:        payload.note || null,
    });
    if (error) {
      if (error.code === "42501" || /row-level security|policy/i.test(error.message || ""))
        return { error: "ไม่มีสิทธิ์มอบหมาย — ต้องเป็นผู้บัญชาการ ผู้ดูแลระบบ หรือยศชั้นสัญญาบัตร" };
      /* ตารางยังไม่ถูกสร้าง — เจอบ่อยตอนลืมรัน SQL หลัง deploy
         ข้อความดิบของ PostgREST พูดถึง schema cache ซึ่งไม่ช่วยให้รู้ว่าต้องทำอะไร */
      if (error.code === "42P01" || /relation .*assignments.* does not exist|schema cache/i.test(error.message || ""))
        return { error: "ยังไม่ได้สร้างตาราง assignments — ต้องรัน supabase/assignments.sql ก่อน" };
      return { error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
}

/* รายชื่อผู้ใช้ที่มอบหมายได้ — อ่านจาก profiles ซึ่งเปิดให้อ่านทุกแถวอยู่แล้ว
   (policy profiles_read) ไม่ได้เปิดอะไรใหม่ */
async function loadAssignableUsers() {
  const SB = window.MDA_SB;
  if (!SB) return { users: [], error: "no_supabase" };
  const { data, error } = await SB
    .from("profiles").select("id,username,full_name,rank,role")
    .order("username", { ascending: true });
  if (error) return { users: [], error: error.message };
  return { users: data || [], error: null };
}

function useInbox(currentUser) {
  const [items, setItems]   = React.useState(null);   // null = ยังไม่โหลด
  const [error, setError]   = React.useState("");
  const myId = currentUser && currentUser.id;

  const load = React.useCallback(async () => {
    const SB = window.MDA_SB;
    if (!SB || !myId) { setItems([]); return; }
    const { data, error: err } = await SB
      .from("assignments").select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) {
      /* ตารางยังไม่มี → กล่องว่างเปล่าแทนที่จะพังทั้งหน้า
         แต่ต้องบอกให้รู้ ไม่ใช่เงียบแล้วปล่อยให้เข้าใจว่าไม่มีข้อความ */
      setError(/does not exist|schema cache/i.test(err.message || "")
        ? "ยังไม่ได้สร้างตาราง assignments — ต้องรัน supabase/assignments.sql"
        : err.message);
      setItems([]);
      return;
    }
    setError("");
    setItems(data || []);
  }, [myId]);

  React.useEffect(() => { load(); }, [load]);

  /* ข้อความใหม่เด้งเข้าทันทีถ้าเปิด realtime ไว้ — ถ้าไม่ได้เปิดก็ไม่พัง
     แค่ต้องกดโหลดใหม่เอง */
  React.useEffect(() => {
    const SB = window.MDA_SB;
    if (!SB || !SB.channel || !myId) return;
    let ch = null;
    try {
      ch = SB.channel("inbox_" + myId + "_" + Math.random().toString(36).slice(2))
        .on("postgres_changes",
            { event: "*", schema: "public", table: "assignments" },
            () => load())
        .subscribe();
    } catch (e) { /* realtime ไม่พร้อม — ไม่ใช่เรื่องคอขาดบาดตาย */ }
    return () => { try { if (ch) SB.removeChannel(ch); } catch (e) {} };
  }, [myId, load]);

  const inbox  = (items || []).filter(a => a.to_id === myId);
  const sent   = (items || []).filter(a => a.to_id !== myId && a.from_id === myId);
  const unread = inbox.filter(a => !a.read_at).length;

  const markRead = React.useCallback(async (id) => {
    const SB = window.MDA_SB;
    if (!SB) return;
    const at = new Date().toISOString();
    setItems(list => (list || []).map(a => (a.id === id ? { ...a, read_at: a.read_at || at } : a)));
    try { await SB.from("assignments").update({ read_at: at }).eq("id", id).is("read_at", null); }
    catch (e) { /* ทำเครื่องหมายว่าอ่านแล้วพลาด ไม่ต้องรบกวนผู้ใช้ */ }
  }, []);

  return { items, inbox, sent, unread, error, reload: load, markRead };
}


/* ── หน้าจอกล่องข้อความ ────────────────────────────────────── */

function InboxScreen({ lang, onNav, showToast, currentUser }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const { inbox, sent, unread, error, reload, markRead } = useInbox(currentUser);
  const [tab, setTab] = React.useState("inbox");
  const list = tab === "inbox" ? inbox : sent;

  const when = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString(lang === "th" ? "th-TH" : "en-GB",
      { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const open = (a) => {
    if (tab === "inbox" && !a.read_at) markRead(a.id);
    onNav("incident", { id: a.event_id });
  };

  const TabBtn = ({ k, label, badge }) => (
    <button onClick={() => setTab(k)}
      className={"btn btn-sm " + (tab === k ? "btn-primary" : "btn-ghost")}
      style={{ gap: 7 }}>
      {label}
      {badge > 0 && <span className="nav-badge" style={{ position: "static" }}>{badge}</span>}
    </button>
  );

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <div className="eyebrow">{T("กล่องข้อความ", "Inbox")}</div>
          <div className="page-title">
            {T("การมอบหมายถึงคุณ", "Assignments for you")}
            {unread > 0 && (
              <span className="nav-badge" style={{ position: "static", marginLeft: 10, verticalAlign: "middle" }}>
                {unread}
              </span>
            )}
          </div>
          <div className="page-sub">
            {T("เหตุการณ์ที่ผู้บังคับบัญชามอบหมายให้คุณรับผิดชอบ",
               "Incidents assigned to you by command")}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          <Icon name="refresh" size={14} />{T("โหลดใหม่", "Reload")}
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <TabBtn k="inbox" label={T("ขาเข้า", "Received")} badge={unread} />
        <TabBtn k="sent"  label={T("ที่ส่งไป", "Sent")} />
      </div>

      {error && (
        <div style={{
          padding: "10px 13px", borderRadius: 8, marginBottom: 12,
          background: "rgba(var(--crit-rgb),0.1)", border: "1px solid rgba(var(--crit-rgb),0.25)",
          color: "var(--crit)", fontSize: "var(--fs-sm)",
        }}>{error}</div>
      )}

      {!list.length && !error && (
        <div className="empty" style={{ marginTop: 40 }}>
          <Icon name="feed" size={30} style={{ color: "var(--text-mute)", marginBottom: 10 }} />
          <div>{tab === "inbox"
            ? T("ยังไม่มีการมอบหมายถึงคุณ", "Nothing assigned to you yet")
            : T("คุณยังไม่ได้มอบหมายเหตุการณ์ให้ใคร", "You have not assigned anything yet")}</div>
        </div>
      )}

      {list.map(a => {
        const unreadRow = tab === "inbox" && !a.read_at;
        return (
          <div key={a.id} onClick={() => open(a)}
            style={{
              padding: "14px 16px", marginBottom: 9, borderRadius: 10, cursor: "pointer",
              display: "flex", alignItems: "flex-start", gap: 14,
              background: unreadRow ? "rgba(var(--accent-rgb),0.06)" : "var(--surface)",
              border: "1px solid " + (unreadRow ? "rgba(var(--accent-rgb),0.35)" : "var(--border)"),
              transition: "all .12s",
            }}>
            {/* จุดหน้าแถว = ยังไม่อ่าน — ที่ว่างขนาดเท่ากันเมื่ออ่านแล้ว
                เพื่อไม่ให้ข้อความขยับไปมาระหว่างสองสถานะ */}
            <span style={{
              width: 9, height: 9, borderRadius: "50%", marginTop: 6, flexShrink: 0,
              background: unreadRow ? "var(--accent)" : "transparent",
              boxShadow: unreadRow ? "0 0 8px var(--accent)" : "none",
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                {a.event_sev && <window.SevBadge sev={a.event_sev} lang={lang} />}
                <span style={{ fontWeight: unreadRow ? 600 : 500, fontSize: "var(--fs-base)" }}>
                  {a.event_title || a.event_id}
                </span>
              </div>
              <div className="dim" style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>
                {tab === "inbox"
                  ? T("จาก ", "From ") + (a.from_name || T("ไม่ทราบผู้ส่ง", "unknown"))
                  : T("ถึง ", "To ") + (a.to_name || T("ไม่ทราบผู้รับ", "unknown"))}
                {" · "}{when(a.created_at)}
                {tab === "sent" && (
                  <span style={{ marginLeft: 8, color: a.read_at ? "var(--ok)" : "var(--text-mute)" }}>
                    {a.read_at ? T("อ่านแล้ว " + when(a.read_at), "read " + when(a.read_at))
                               : T("ยังไม่ได้อ่าน", "unread")}
                  </span>
                )}
              </div>
              {a.note && (
                <div style={{ fontSize: "var(--fs-sm)", marginTop: 7, lineHeight: 1.6,
                  color: "var(--text)", whiteSpace: "pre-wrap" }}>{a.note}</div>
              )}
              <div className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--text-mute)", marginTop: 6 }}>
                {a.event_id}
              </div>
            </div>
            <Icon name="chevR" size={16} style={{ color: "var(--text-mute)", flexShrink: 0, marginTop: 4 }} />
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { InboxScreen, useInbox, sendAssignment, loadAssignableUsers });
