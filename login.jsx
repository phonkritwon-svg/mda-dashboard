/* ============================================================
   หน้าเข้าสู่ระบบ + ระดับสิทธิ์ผู้ใช้ (Supabase Auth)

   สามระดับ — ค่าจริงเก็บใน profiles.role ฝั่ง Supabase
     admin      ผู้ดูแลระบบ  เข้าถึงได้ทั้งหมด + เปลี่ยน role ของคนอื่น
     commander  ผู้บัญชาการ  มอบหมายงานได้
     user       ผู้ใช้งาน    มอบหมายงานไม่ได้

   ⚠ การเช็ค role ในไฟล์นี้เป็นแค่การซ่อนปุ่มให้ UI ไม่หลอกตา
     ไม่ใช่การบังคับสิทธิ์ ตัวบังคับจริงคือ RLS + trigger ใน
     supabase/roles.sql — ใครเปิด devtools ก็เรียกฟังก์ชันเองได้
     ห้ามพึ่งไฟล์นี้เป็นด่านความปลอดภัยเด็ดขาด

   ไม่มีปุ่มสมัครใช้งาน: บัญชีถูกสร้างโดย admin เท่านั้น
   (ดูขั้นตอนใน DEPLOY.md หัวข้อ "ผู้ใช้และสิทธิ์")
   ============================================================ */

/* ── ระดับสิทธิ์ ────────────────────────────────────────────── */

const MDA_ROLES = ["admin", "commander", "user"];

const ROLE_LABEL = {
  admin:     { th: "ผู้ดูแลระบบ", en: "Administrator" },
  commander: { th: "ผู้บัญชาการ", en: "Commander" },
  user:      { th: "ผู้ใช้งาน",   en: "Operator" },
};

/* ค่าที่อ่านมาจาก DB อาจเป็นอะไรก็ได้ (ของเก่า 'Operator', พิมพ์ผิด, null)
   ต้องบีบให้เหลือสามค่าเสมอ และ fallback ที่ปลอดภัยคือสิทธิ์ต่ำสุด */
function normRole(r) {
  const k = String(r || "").trim().toLowerCase();
  return MDA_ROLES.indexOf(k) >= 0 ? k : "user";
}

function roleLabel(r, lang) {
  const l = ROLE_LABEL[normRole(r)];
  return lang === "en" ? l.en : l.th;
}

/* สิทธิ์ที่ใช้จริงในแอป — เพิ่มการกระทำใหม่ที่นี่ที่เดียว
   ไม่กระจาย if (role === "admin") ไว้ตามไฟล์ ไม่งั้นวันที่กติกาเปลี่ยน
   จะต้องไล่แก้ทุกจุดแล้วตกหล่นแน่นอน

   ตอนนี้มีรายการเดียวคือ assign ตามที่ระบุมา — ตั้งใจไม่ใส่สิทธิ์ที่ยัง
   ไม่มีใครเรียกใช้ ตารางสิทธิ์ที่มีบรรทัดตายอยู่จะทำให้อ่านแล้วเข้าใจผิด
   ว่าระบบบังคับอะไรบางอย่างอยู่ทั้งที่ไม่ได้บังคับ */
const ROLE_CAN = {
  admin:     { assign: true  },
  commander: { assign: true  },
  user:      { assign: false },
};

function can(user, action) {
  const perms = ROLE_CAN[normRole(user && user.role)];
  return !!(perms && perms[action]);
}


/* ── หน้าเข้าสู่ระบบ ────────────────────────────────────────── */

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
}

function LoginScreen() {
  const [lang, setLang]       = React.useState("th");
  const T = (th, en) => (lang === "th" ? th : en);

  const [email, setEmail]     = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [error, setError]     = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const SB = window.MDA_SB;

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

  /* ข้อความจาก Supabase เป็นอังกฤษล้วน แปลเฉพาะตัวที่เจอบ่อย
     ตัวที่ไม่รู้จักปล่อยผ่านดิบ ๆ ดีกว่าเดาผิดแล้วผู้ใช้ไล่ตามไม่ถูก */
  const translateAuthError = (msg) => {
    if (!msg) return T("เกิดข้อผิดพลาด", "Something went wrong");
    if (/Invalid login credentials/i.test(msg))
      return T("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "Invalid email or password");
    if (/Email not confirmed/i.test(msg))
      return T("บัญชียังไม่ได้ยืนยัน — ติดต่อผู้ดูแลระบบ",
               "Account not confirmed — contact your administrator");
    if (/rate limit|too many/i.test(msg))
      return T("ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่",
               "Too many attempts — please wait and try again");
    return msg;
  };

  const submit = async () => {
    setError("");
    if (!isValidEmail(email)) return setError(T("กรุณากรอกอีเมลให้ถูกต้อง", "Please enter a valid email"));
    if (!password)            return setError(T("กรุณากรอกรหัสผ่าน", "Please enter your password"));
    if (!SB)                  return setError(T("เชื่อมต่อฐานข้อมูลไม่ได้", "Cannot reach the database"));

    setLoading(true);
    let err = null;
    try {
      const res = await SB.auth.signInWithPassword({ email: email.trim(), password });
      err = res.error;
    } catch (e) {
      err = e;
    }
    setLoading(false);
    if (err) return setError(translateAuthError(err.message));
    // สำเร็จ — app.jsx ดักที่ onAuthStateChange แล้วสลับหน้าให้เอง
  };

  const onEnter = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 500, fontFamily: "var(--font-ui)",
    }}>
      {/* พื้นหลัง: ตาราง + วงเรดาร์กวาด */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.035, pointerEvents: "none",
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />
      {[300, 480, 680].map(r => (
        <div key={r} style={{
          position: "absolute", top: "50%", left: "50%",
          width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r,
          borderRadius: "50%", border: "1px solid rgba(var(--accent-rgb),0.06)", pointerEvents: "none",
        }} />
      ))}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        width: 680, height: 680, marginLeft: -340, marginTop: -340,
        borderRadius: "50%", overflow: "hidden", pointerEvents: "none", opacity: 0.2,
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "conic-gradient(from 0deg, transparent 300deg, rgba(var(--accent-rgb),0.25) 360deg)",
          animation: "sweep 6s linear infinite", transformOrigin: "center",
        }} />
      </div>

      {/* สลับภาษา */}
      <div style={{ position: "absolute", top: 18, right: 20, display: "flex", gap: 6 }}>
        {["th", "en"].map(l => (
          <button key={l} onClick={() => setLang(l)}
            className={"btn btn-sm " + (lang === l ? "btn-primary" : "btn-ghost")}
            style={{ minWidth: 36, padding: "3px 10px" }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{
        position: "relative", zIndex: 1, width: 420,
        background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 14,
        boxShadow: "var(--shadow), 0 0 80px rgba(var(--accent-rgb),0.08)",
        overflow: "hidden", maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ padding: "20px 24px 4px", display: "flex", justifyContent: "center" }}>
          <div className="login-logo-plate">
            <img src="logo.jpg?v=2"
              alt={T("กรมการสื่อสารและเทคโนโลยีสารสนเทศทหารเรือ",
                     "Naval Communications and Information Technology Department")}
              onError={(e) => { e.currentTarget.closest(".login-logo-plate").style.display = "none"; }} />
          </div>
        </div>

        <div style={{
          padding: "16px 24px", borderBottom: "1px solid var(--border)",
          background: "linear-gradient(135deg, rgba(var(--accent-rgb),0.06) 0%, transparent 100%)",
        }}>
          <div className="row" style={{ gap: 13 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 11, flexShrink: 0,
              background: "rgba(var(--accent-rgb),0.13)", border: "1px solid rgba(var(--accent-rgb),0.3)",
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
        </div>

        <div style={{ padding: "20px 24px" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{T("อีเมล", "Email")}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoFocus placeholder={T("กรอกอีเมล", "Enter email")}
              onKeyDown={onEnter} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{T("รหัสผ่าน", "Password")}</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={onEnter} placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 38 }} />
              <span onClick={() => setShowPass(s => !s)}
                title={T("แสดง/ซ่อนรหัสผ่าน", "Show / hide password")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}>
                <Icon name="eye" size={16} />
              </span>
            </div>
          </div>

          {error && (
            <div style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 7,
              background: "rgba(var(--crit-rgb),0.1)", border: "1px solid rgba(var(--crit-rgb),0.25)",
              color: "var(--crit)", fontSize: "var(--fs-sm)", display: "flex", alignItems: "center", gap: 7,
            }}>
              <Icon name="alert" size={13} />{error}
            </div>
          )}

          <button className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", gap: 9, height: 40 }}
            onClick={submit} disabled={loading}>
            {loading ? (
              <><Icon name="refresh" size={15} style={{ animation: "sweep 0.9s linear infinite" }} />
                {T("กำลังเข้าสู่ระบบ...", "Signing in...")}</>
            ) : (
              <><Icon name="shield" size={15} />{T("เข้าสู่ระบบ", "Log In")}</>
            )}
          </button>

          <div style={{ marginTop: 12, textAlign: "center", fontSize: "var(--fs-xs)", color: "var(--text-mute)", lineHeight: 1.7 }}>
            {T("บัญชีถูกสร้างโดยผู้ดูแลระบบเท่านั้น", "Accounts are created by an administrator only")}
            <br />
            {T("ยังไม่มีบัญชี — ติดต่อผู้ดูแลระบบ", "No account yet — contact your administrator")}
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

Object.assign(window, { LoginScreen, MDA_ROLES, ROLE_LABEL, normRole, roleLabel, can });
