/* ============================================================
   Register Screen — สมัครใช้งาน
   ============================================================ */
function LoginScreen({ onLogin }) {
  const [lang, setLang] = React.useState("th");
  const T = (th, en) => lang === "th" ? th : en;

  const [fullname, setFullname]       = React.useState("");
  const [rank, setRank]               = React.useState("");
  const [username, setUsername]       = React.useState("");
  const [password, setPassword]       = React.useState("");
  const [confirmPass, setConfirmPass] = React.useState("");
  const [showPass, setShowPass]       = React.useState(false);
  const [error, setError]             = React.useState("");
  const [loading, setLoading]         = React.useState(false);

  const RANKS = ["พล.ร.อ.", "พล.ร.ท.", "พล.ร.ต.", "น.อ.", "น.ท.", "น.ต.", "ร.อ.", "ร.ท.", "ร.ต.", "จ.อ.", "พันจ่า", "จ่า", "พลทหาร", "พลเรือ"];

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "var(--surface)", border: "1px solid var(--border-2)",
    borderRadius: 7, padding: "10px 12px",
    color: "var(--text)", fontSize: "var(--fs-sm)",
    fontFamily: "var(--font-ui)", outline: "none",
  };
  const labelStyle = {
    fontSize: "var(--fs-xs)", color: "var(--text-dim)",
    letterSpacing: "0.06em", textTransform: "uppercase",
    display: "block", marginBottom: 6, fontWeight: 500,
  };

  const handleRegister = () => {
    setError("");
    if (!fullname.trim())  return setError(T("กรุณากรอกชื่อ-นามสกุล", "Please enter your full name"));
    if (!rank)             return setError(T("กรุณาเลือกยศ/ตำแหน่ง", "Please select your rank"));
    if (!username.trim())  return setError(T("กรุณากรอกชื่อผู้ใช้", "Please enter a username"));
    if (username.length < 4) return setError(T("ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร", "Username must be at least 4 characters"));
    if (password.length < 6) return setError(T("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "Password must be at least 6 characters"));
    if (password !== confirmPass) return setError(T("รหัสผ่านไม่ตรงกัน", "Passwords do not match"));

    setLoading(true);
    setTimeout(() => {
      const initials = fullname.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const user = {
        user: username,
        pass: password,
        name: fullname.trim(),
        rank,
        role: T("ผู้ใช้งานใหม่", "New User"),
        avatar: initials,
      };
      onLogin(user);
    }, 1000);
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 500, fontFamily: "var(--font-ui)",
    }}>
      {/* grid bg */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.035, pointerEvents: "none",
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />
      {/* radar rings */}
      {[300, 480, 680].map(r => (
        <div key={r} style={{
          position: "absolute", top: "50%", left: "50%",
          width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r,
          borderRadius: "50%",
          border: "1px solid rgba(var(--accent-rgb),0.06)",
          pointerEvents: "none",
        }} />
      ))}
      {/* sweep */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        width: 680, height: 680, marginLeft: -340, marginTop: -340,
        borderRadius: "50%", overflow: "hidden", pointerEvents: "none", opacity: 0.2,
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "conic-gradient(from 0deg, transparent 300deg, rgba(var(--accent-rgb),0.25) 360deg)",
          animation: "sweep 6s linear infinite",
          transformOrigin: "center",
        }} />
      </div>

      {/* lang toggle */}
      <div style={{ position: "absolute", top: 18, right: 20, display: "flex", gap: 6 }}>
        {["th", "en"].map(l => (
          <button key={l} onClick={() => setLang(l)}
            className={"btn btn-sm " + (lang === l ? "btn-primary" : "btn-ghost")}
            style={{ minWidth: 36, padding: "3px 10px" }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* card */}
      <div style={{
        position: "relative", zIndex: 1, width: 420,
        background: "var(--surface-2)",
        border: "1px solid var(--border-2)", borderRadius: 14,
        boxShadow: "var(--shadow), 0 0 80px rgba(var(--accent-rgb),0.08)",
        overflow: "hidden",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* header */}
        <div style={{
          padding: "22px 24px 16px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(135deg, rgba(var(--accent-rgb),0.06) 0%, transparent 100%)",
        }}>
          <div className="row" style={{ gap: 13, marginBottom: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 11, flexShrink: 0,
              background: "rgba(var(--accent-rgb),0.13)",
              border: "1px solid rgba(var(--accent-rgb),0.3)",
              display: "grid", placeItems: "center", color: "var(--accent)",
            }}>
              <Icon name="radar" size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>MDA · Maritime Domain Awareness</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
                ศูนย์บัญชาการข่าวทางทะเล
              </div>
            </div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>
            {T("สมัครใช้งานระบบ", "Create Account")}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-mute)", marginTop: 3 }}>
            {T("กรอกข้อมูลเพื่อสมัครบัญชีผู้ใช้ใหม่", "Fill in details to register a new account")}
          </div>
        </div>

        {/* form */}
        <div style={{ padding: "20px 24px" }}>

          {/* full name */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{T("ชื่อ-นามสกุล", "Full Name")}</label>
            <input type="text" value={fullname}
              onChange={e => setFullname(e.target.value)}
              placeholder={T("กรอกชื่อ-นามสกุล", "Enter full name")}
              autoFocus style={inputStyle} />
          </div>

          {/* rank */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{T("ยศ / ตำแหน่ง", "Rank / Position")}</label>
            <select value={rank} onChange={e => setRank(e.target.value)}
              style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
              <option value="">{T("-- เลือกยศ --", "-- Select rank --")}</option>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* username */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{T("ชื่อผู้ใช้", "Username")}</label>
            <input type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={T("ตั้งชื่อผู้ใช้ (อย่างน้อย 4 ตัวอักษร)", "Set username (min 4 chars)")}
              style={inputStyle} />
          </div>

          {/* password */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{T("รหัสผ่าน", "Password")}</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={T("ตั้งรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)", "Set password (min 6 chars)")}
                style={{ ...inputStyle, paddingRight: 38 }} />
              <span onClick={() => setShowPass(s => !s)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}>
                <Icon name="eye" size={16} />
              </span>
            </div>
          </div>

          {/* confirm password */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{T("ยืนยันรหัสผ่าน", "Confirm Password")}</label>
            <input
              type="password" value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRegister()}
              placeholder="••••••••"
              style={{
                ...inputStyle,
                borderColor: confirmPass && confirmPass !== password ? "var(--crit)" : undefined,
              }} />
          </div>

          {error && (
            <div style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 7,
              background: "rgba(var(--crit-rgb),0.1)", border: "1px solid rgba(var(--crit-rgb),0.25)",
              color: "var(--crit)", fontSize: "var(--fs-sm)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <Icon name="alert" size={13} />{error}
            </div>
          )}

          <button className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", gap: 9, height: 40 }}
            onClick={handleRegister}
            disabled={loading}>
            {loading ? (
              <><Icon name="refresh" size={15} style={{ animation: "sweep 0.9s linear infinite" }} />{T("กำลังสมัครใช้งาน...", "Registering...")}</>
            ) : (
              <><Icon name="shield" size={15} />{T("สมัครใช้งาน", "Sign Up")}</>
            )}
          </button>

          <div style={{ marginTop: 10, textAlign: "center" }}>
            <span
              style={{ fontSize: "var(--fs-xs)", color: "var(--info)", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => onLogin({ user:"demo", name:"ผู้ทดสอบระบบ", rank:"น.ต.", role:"Demo User", avatar:"ทด" })}>
              {T("ข้ามเข้าระบบ (Demo)", "Enter as Demo")}
            </span>
          </div>
        </div>

        <div style={{
          padding: "9px 24px", borderTop: "1px solid var(--border)",
          fontSize: 10, color: "var(--text-mute)", letterSpacing: "0.04em", textAlign: "center",
        }}>
          THAI NAVAL INTELLIGENCE · MDA v2.0
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen });
