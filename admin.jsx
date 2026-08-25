/* ============================================================
   จอจัดการผู้ใช้ — สำหรับ admin เท่านั้น

   ทำอะไรได้: ดูรายชื่อผู้ใช้ทั้งหมด · เปลี่ยน role · เปลี่ยนยศ

   ⚠ การซ่อนจอนี้จากคนที่ไม่ใช่ admin เป็นเรื่องหน้าตา ไม่ใช่ความปลอดภัย
     ตัวบังคับจริงคือ policy profiles_update_admin กับ trigger
     profiles_guard_privileges ใน supabase/ — ต่อให้เรียก API ตรงก็ไม่ผ่าน
     จอนี้แค่ทำให้ไม่ต้องเปิด SQL Editor ทุกครั้งที่มีคนสมัครเข้ามา

   สิ่งที่ทำไม่ได้จากที่นี่: สร้างบัญชีใหม่ กับ ลบบัญชี
   ทั้งสองอย่างต้องใช้ service_role key ซึ่งห้ามอยู่ในเบราว์เซอร์เด็ดขาด
   ต้องทำที่ Supabase → Authentication → Users
   ============================================================ */
function AdminUsers({ lang, showToast, currentUser }) {
  const T = (th, en) => (lang === "th" ? th : en);

  const [rows, setRows]       = React.useState(null);   // null = ยังไม่โหลด
  const [error, setError]     = React.useState("");
  const [query, setQuery]     = React.useState("");
  const [savingId, setSavingId] = React.useState("");
  const [otherFor, setOtherFor] = React.useState("");   // id ของแถวที่กำลังพิมพ์ยศเอง
  const [otherText, setOtherText] = React.useState("");

  const SB = window.MDA_SB;
  const RANKS = window.RANKS || [];
  const RANK_OTHER = window.RANK_OTHER || "__other__";
  const ROLES = window.MDA_ROLES || ["admin", "commander", "user"];

  const load = React.useCallback(async () => {
    if (!SB) { setError(T("เชื่อมต่อฐานข้อมูลไม่ได้", "Cannot reach the database")); return; }
    setError("");
    const { data, error: err } = await SB
      .from("profiles").select("*").order("created_at", { ascending: true });
    if (err) { setError(err.message); setRows([]); return; }
    setRows(data || []);
  }, [SB]);

  React.useEffect(() => { load(); }, [load]);

  /* บันทึกทีละช่อง แทนที่จะมีปุ่ม "บันทึก" รวม — เปลี่ยน role ของคนหนึ่งคน
     คือการกระทำที่จบในตัว ไม่ควรค้างอยู่ในฟอร์มจนลืมกดยืนยัน
     patch มีคีย์เดียวเสมอ จึงไม่เขียนทับค่าอื่นที่คนอื่นอาจเพิ่งแก้ */
  const patch = async (row, changes, label) => {
    if (!SB) return;
    setSavingId(row.id);
    const { error: err } = await SB.from("profiles").update(changes).eq("id", row.id);
    setSavingId("");
    if (err) {
      /* trigger จะโยนข้อความอังกฤษ only an admin can change a profile role/rank
         ถ้าคนที่ไม่ใช่ admin หลุดมาถึงตรงนี้ (เช่นเรียกจาก devtools
         หรือ role ถูกลดระหว่างเปิดหน้าค้างไว้) */
      const msg = /only an admin/i.test(err.message || "")
        ? T("ไม่มีสิทธิ์แก้ — ต้องเป็นผู้ดูแลระบบ", "Not permitted — administrator only")
        : err.message;
      if (showToast) showToast(msg, "error");
      return;
    }
    setRows(rs => rs.map(r => (r.id === row.id ? { ...r, ...changes } : r)));
    if (showToast) showToast(label, "ok");
  };

  const changeRole = (row, role) =>
    patch(row, { role }, T(
      "เปลี่ยน " + (row.username || "ผู้ใช้") + " เป็น " + window.roleLabel(role, "th") + " แล้ว",
      "Set " + (row.username || "user") + " to " + window.roleLabel(role, "en")));

  const changeRank = (row, rank) =>
    patch(row, { rank }, T(
      "เปลี่ยนยศ " + (row.username || "ผู้ใช้") + " เป็น " + (rank || "-") + " แล้ว",
      "Set rank of " + (row.username || "user") + " to " + (rank || "-")));

  const visible = (rows || []).filter(r => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.username, r.full_name, r.rank, r.role].join(" ").toLowerCase().indexOf(q) >= 0;
  });

  const isSelf = (row) => currentUser && row.username === currentUser.user;

  const selStyle = {
    background: "var(--surface)", border: "1px solid var(--border-2)",
    borderRadius: 6, padding: "5px 8px", color: "var(--text)",
    fontFamily: "var(--font-ui)", fontSize: "var(--fs-xs)", cursor: "pointer",
  };

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <div className="eyebrow">{T("ผู้ดูแลระบบ", "Administration")}</div>
          <div className="page-title">{T("จัดการผู้ใช้", "User management")}</div>
          <div className="page-sub">
            {T("เปลี่ยนระดับสิทธิ์และยศของผู้ใช้ — สร้างและลบบัญชีต้องทำที่ Supabase",
               "Change roles and ranks — creating and deleting accounts is done in Supabase")}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <Icon name="refresh" size={14} />{T("โหลดใหม่", "Reload")}
        </button>
      </div>

      <window.Panel title={T("ผู้ใช้ทั้งหมด", "All users")} icon="shield"
        action={rows ? <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>
          {visible.length}/{rows.length}
        </span> : null}>

        <div style={{ padding: "10px 12px 0" }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={T("ค้นหาชื่อผู้ใช้ ชื่อจริง ยศ หรือสิทธิ์…", "Search username, name, rank or role…")}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--surface)", border: "1px solid var(--border-2)",
              borderRadius: 7, padding: "8px 11px", color: "var(--text)",
              fontFamily: "var(--font-ui)", fontSize: "var(--fs-sm)", outline: "none",
            }} />
        </div>

        {error && (
          <div style={{
            margin: "12px", padding: "9px 12px", borderRadius: 7,
            background: "rgba(var(--crit-rgb),0.1)", border: "1px solid rgba(var(--crit-rgb),0.25)",
            color: "var(--crit)", fontSize: "var(--fs-sm)",
          }}>{error}</div>
        )}

        {rows === null && (
          <div className="empty" style={{ padding: "26px 0" }}>
            <Icon name="refresh" size={16} style={{ animation: "sweep 0.9s linear infinite" }} />
            <span style={{ marginLeft: 8 }}>{T("กำลังโหลด…", "Loading…")}</span>
          </div>
        )}

        {rows !== null && !visible.length && (
          <div className="empty" style={{ padding: "26px 0" }}>
            {rows.length ? T("ไม่พบผู้ใช้ที่ตรงกับคำค้น", "No user matches that search")
                         : T("ยังไม่มีผู้ใช้ในระบบ", "No users yet")}
          </div>
        )}

        <div style={{ padding: 12 }}>
          {visible.map(r => {
            const rank = r.rank || "";
            const known = RANKS.some(x => x.v === rank);
            const picking = otherFor === r.id;
            return (
              <div key={r.id} style={{
                padding: "11px 12px", marginBottom: 8, borderRadius: 9,
                border: "1px solid var(--border)", background: "var(--surface)",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                opacity: savingId === r.id ? 0.55 : 1, transition: "opacity .12s",
              }}>
                <div style={{ flex: "1 1 190px", minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: "var(--fs-sm)" }}>
                    {[rank, r.full_name || r.username].filter(Boolean).join(" ")}
                    {isSelf(r) && (
                      <span className="dim" style={{ fontSize: "var(--fs-xs)", marginLeft: 7 }}>
                        ({T("คุณ", "you")})
                      </span>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
                    {r.username || "—"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>{T("ยศ", "Rank")}</span>
                  {picking ? (
                    <React.Fragment>
                      <input autoFocus value={otherText} onChange={e => setOtherText(e.target.value)}
                        placeholder={T("ระบุยศ", "Specify")}
                        onKeyDown={e => {
                          if (e.key === "Enter" && otherText.trim()) {
                            changeRank(r, otherText.trim()); setOtherFor(""); setOtherText("");
                          }
                          if (e.key === "Escape") { setOtherFor(""); setOtherText(""); }
                        }}
                        style={{ ...selStyle, cursor: "text", width: 120, outline: "none" }} />
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => { setOtherFor(""); setOtherText(""); }}>
                        {T("ยกเลิก", "Cancel")}
                      </button>
                    </React.Fragment>
                  ) : (
                    <select style={selStyle} value={known ? rank : (rank ? RANK_OTHER : "")}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === RANK_OTHER) { setOtherFor(r.id); setOtherText(known ? "" : rank); return; }
                        changeRank(r, v);
                      }}>
                      <option value="">{T("— ไม่ระบุ —", "— none —")}</option>
                      {RANKS.map(x => <option key={x.v} value={x.v}>{x.v} ({x.full})</option>)}
                      <option value={RANK_OTHER}>
                        {known || !rank ? T("อื่น ๆ …", "Other…") : rank + T(" (อื่น ๆ)", " (other)")}
                      </option>
                    </select>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>{T("สิทธิ์", "Role")}</span>
                  <select style={selStyle} value={window.normRole(r.role)}
                    onChange={e => changeRole(r, e.target.value)}>
                    {ROLES.map(x => (
                      <option key={x} value={x}>{window.roleLabel(x, lang)}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </window.Panel>

      <div className="dim" style={{ fontSize: "var(--fs-xs)", marginTop: 12, lineHeight: 1.8 }}>
        {T("• เปลี่ยนแล้วมีผลทันที ผู้ใช้ต้องโหลดหน้าใหม่จึงจะเห็นสิทธิ์ใหม่",
           "• Changes take effect at once; the user must reload to see them")}
        <br />
        {T("• ยศชั้นสัญญาบัตร (ร.ต. ขึ้นไป) สั่งการได้เท่ากับผู้บัญชาการ แม้สิทธิ์เป็นผู้ใช้งาน",
           "• Commissioned ranks (ร.ต. and above) can command even with the operator role")}
        <br />
        {T("• สร้างบัญชีใหม่และลบบัญชี ทำที่ Supabase → Authentication → Users",
           "• Creating and deleting accounts is done in Supabase → Authentication → Users")}
      </div>
    </div>
  );
}

Object.assign(window, { AdminUsers });
