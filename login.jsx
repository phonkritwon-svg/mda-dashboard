/* ============================================================
   หน้าเข้าสู่ระบบ / สมัครใช้งาน + ระดับสิทธิ์ผู้ใช้ (Supabase Auth)

   สามระดับ — ค่าจริงเก็บใน profiles.role ฝั่ง Supabase
     admin      ผู้ดูแลระบบ  เข้าถึงได้ทั้งหมด + เปลี่ยน role ของคนอื่น
     commander  ผู้บัญชาการ  มอบหมายงานได้
     user       ผู้ใช้งาน    มอบหมายงานไม่ได้

   ⚠ การเช็ค role ในไฟล์นี้เป็นแค่การซ่อนปุ่มให้ UI ไม่หลอกตา
     ไม่ใช่การบังคับสิทธิ์ ตัวบังคับจริงคือ RLS + trigger ใน
     supabase/roles.sql — ใครเปิด devtools ก็เรียกฟังก์ชันเองได้
     ห้ามพึ่งไฟล์นี้เป็นด่านความปลอดภัยเด็ดขาด

   สมัครเองได้ และคนที่สมัครเข้าใช้งานได้ทันทีด้วยสิทธิ์ต่ำสุด —
   ปลอดภัยเพราะ trigger handle_new_user() บังคับ role='user' เสมอ
   ไม่สนใจค่าที่ฝั่งเบราว์เซอร์ส่งมา จะเลื่อนขั้นได้ต้องให้ admin สั่งเท่านั้น
   (ดู DEPLOY.md หัวข้อ "ผู้ใช้และสิทธิ์")
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

   command      คุมสองปุ่มในหน้าเหตุการณ์พร้อมกัน: มอบหมาย · ยกระดับ
                ทั้งสองเป็นการสั่งการเหมือนกัน จึงใช้เงื่อนไขเดียว ไม่แยกเป็นสองสิทธิ์
                ให้หลุดกันคนละทาง — ยศชั้นสัญญาบัตรก็ได้สิทธิ์นี้ (ดู isOfficerRank)

   manageUsers  หน้าจัดการผู้ใช้ — เปลี่ยน role/ยศ ของคนอื่น admin เท่านั้น
                ยศไม่ช่วยตรงนี้ ไม่งั้นคนที่พิมพ์ยศตัวเองว่า "พล.ร.อ." ตอนสมัคร
                จะแต่งตั้ง admin ได้เอง ซึ่งพังทั้งระบบสิทธิ์ */
const ROLE_CAN = {
  admin:     { command: true,  manageUsers: true  },
  commander: { command: true,  manageUsers: false },
  user:      { command: false, manageUsers: false },
};

/* ยศชั้นสัญญาบัตร — ได้สิทธิ์สั่งการเท่ากับผู้บัญชาการ แม้ role จะเป็น user
   ร.ต. ขึ้นไปถึง พล.ร.อ. ส่วนชั้นประทวน (จ.*, พ.จ.*), พลฯ และ "อื่น ๆ" ไม่ได้

   ⚠ ยศเป็นค่าที่ผู้ใช้เลือกเองตอนสมัคร ไม่มีการตรวจสอบ — ใครเลือก "พล.ร.อ."
     ก็ได้สิทธิ์นี้ทันที ต่างจาก role ที่ admin เท่านั้นให้ได้ ถ้าต้องการให้
     ยศมีน้ำหนักจริงต้องให้ admin ยืนยันยศก่อน (ดู DEPLOY.md) */
const OFFICER_RANKS = [
  "ร.ต.", "ร.ท.", "ร.อ.",
  "น.ต.", "น.ท.", "น.อ.",
  "พล.ร.ต.", "พล.ร.ท.", "พล.ร.อ.",
];

/* เทียบแบบตรงตัวเท่านั้น ห้ามใช้ indexOf บนสตริง — "พล.ร.ต." มี "ร.ต." อยู่ข้างใน
   ถ้าเทียบแบบ substring ชั้นประทวนที่พิมพ์อะไรมาใกล้เคียงก็จะหลุดเข้ามาได้ */
function isOfficerRank(rank) {
  return OFFICER_RANKS.indexOf(String(rank || "").trim()) >= 0;
}

function can(user, action) {
  const perms = ROLE_CAN[normRole(user && user.role)];
  if (perms && perms[action]) return true;
  if (action === "command" && isOfficerRank(user && user.rank)) return true;
  return false;
}


/* ── หน้าเข้าสู่ระบบ / สมัครใช้งาน ──────────────────────────── */

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
}

/* ยศทหารเรือ เรียงจากชั้นผู้น้อยขึ้นไป
   value = ตัวย่อ เพราะเป็นค่าที่ถูกเก็บลง profiles.rank แล้วเอาไปต่อหน้าชื่อ
   ในป้ายตัวตนมุมขวาบน ("น.ต. สมชาย ใจดี") ส่วนชื่อเต็มในวงเล็บมีไว้ให้เลือกถูก
   ไม่ใช่ทุกคนแยก จ.ต. กับ พ.จ.ต. ออกจากกันได้จากตัวย่อล้วน ๆ */
const RANK_OTHER = "__other__";

const RANKS = [
  { v: "จ.ต.",    full: "จ่าตรี" },
  { v: "จ.ท.",    full: "จ่าโท" },
  { v: "จ.อ.",    full: "จ่าเอก" },
  { v: "พ.จ.ต.",  full: "พันจ่าตรี" },
  { v: "พ.จ.ท.",  full: "พันจ่าโท" },
  { v: "พ.จ.อ.",  full: "พันจ่าเอก" },
  { v: "ร.ต.",    full: "เรือตรี" },
  { v: "ร.ท.",    full: "เรือโท" },
  { v: "ร.อ.",    full: "เรือเอก" },
  { v: "น.ต.",    full: "นาวาตรี" },
  { v: "น.ท.",    full: "นาวาโท" },
  { v: "น.อ.",    full: "นาวาเอก" },
  { v: "พล.ร.ต.", full: "พลเรือตรี" },
  { v: "พล.ร.ท.", full: "พลเรือโท" },
  { v: "พล.ร.อ.", full: "พลเรือเอก" },
  { v: "พลฯ",     full: "พลทหาร" },
];

function LoginScreen() {
  const [lang, setLang] = React.useState("th");
  const T = (th, en) => (lang === "th" ? th : en);

  const [mode, setMode]         = React.useState("login");   // "login" | "register"
  const [fullname, setFullname] = React.useState("");
  const [rank, setRank]         = React.useState("");
  const [rankOther, setRankOther] = React.useState("");   // ใช้เมื่อเลือก "อื่น ๆ"
  const [username, setUsername] = React.useState("");
  const [email, setEmail]       = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPass, setConfirmPass] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [error, setError]       = React.useState("");
  const [notice, setNotice]     = React.useState("");
  const [loading, setLoading]   = React.useState(false);

  const SB = window.MDA_SB;
  const isReg = mode === "register";

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
      return T("บัญชียังไม่ได้ยืนยัน — ตรวจอีเมลของคุณ หรือติดต่อผู้ดูแลระบบ",
               "Account not confirmed — check your email or contact an administrator");
    /* ปิด Enable sign-ups ไว้ที่ Supabase → ฟอร์มนี้จะยิงไม่ผ่านทุกครั้ง
       ข้อความดิบคือ "Signups not allowed for this instance" ซึ่งผู้ใช้ทั่วไป
       อ่านแล้วไม่รู้ว่าต้องไปแก้ที่ไหน ต้องบอกให้ชัดว่าเป็นการตั้งค่า ไม่ใช่ความผิดเขา */
    if (/signups? not allowed|signup is disabled/i.test(msg))
      return T("ระบบปิดรับสมัครอยู่ — ผู้ดูแลต้องเปิด Enable sign-ups ใน Supabase ก่อน",
               "Sign-ups are disabled — an administrator must enable them in Supabase");
    if (/already registered|already been registered|User already/i.test(msg))
      return T("อีเมลนี้ถูกใช้สมัครไปแล้ว", "This email is already registered");
    /* username ในตาราง profiles เป็น UNIQUE — ถ้าชนกัน trigger จะโยน error
       แล้ว insert เข้า auth.users ถูก rollback ทั้งก้อน บัญชีจึงไม่ถูกสร้าง
       ผู้ใช้เห็นแค่ข้อความ duplicate key ดิบ ๆ ซึ่งไม่บอกว่าให้แก้ช่องไหน */
    if (/duplicate key|profiles_username_key|unique constraint/i.test(msg))
      return T("ชื่อผู้ใช้นี้ถูกใช้แล้ว — กรุณาตั้งชื่ออื่น",
               "That username is taken — please choose another");
    if (/Password should be at least/i.test(msg))
      return T("รหัสผ่านสั้นเกินไป", "Password too short");
    if (/rate limit|too many/i.test(msg))
      return T("ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่",
               "Too many attempts — please wait and try again");
    return msg;
  };

  const handleLogin = async () => {
    if (!isValidEmail(email)) return setError(T("กรุณากรอกอีเมลให้ถูกต้อง", "Please enter a valid email"));
    if (!password)            return setError(T("กรุณากรอกรหัสผ่าน", "Please enter your password"));

    setLoading(true);
    let err = null;
    try {
      const res = await SB.auth.signInWithPassword({ email: email.trim(), password });
      err = res.error;
    } catch (e) { err = e; }
    setLoading(false);
    if (err) return setError(translateAuthError(err.message));
    // สำเร็จ — app.jsx ดักที่ onAuthStateChange แล้วสลับหน้าให้เอง
  };

  const handleRegister = async () => {
    if (!fullname.trim())     return setError(T("กรุณากรอกชื่อ-นามสกุล", "Please enter your full name"));
    if (!rank)                return setError(T("กรุณาเลือกยศ / ตำแหน่ง", "Please select your rank"));
    if (rank === RANK_OTHER && !rankOther.trim())
      return setError(T("กรุณาระบุยศ / ตำแหน่ง", "Please specify your rank"));
    if (username.trim().length < 4)
      return setError(T("ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร", "Username must be at least 4 characters"));
    if (!isValidEmail(email)) return setError(T("กรุณากรอกอีเมลให้ถูกต้อง", "Please enter a valid email"));
    if (password.length < 6)  return setError(T("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "Password must be at least 6 characters"));
    if (password !== confirmPass) return setError(T("รหัสผ่านไม่ตรงกัน", "Passwords do not match"));

    setLoading(true);
    let err = null, data = null;
    try {
      /* ไม่ส่ง role มาด้วยโดยตั้งใจ — trigger handle_new_user() ไม่อ่านค่านี้แล้ว
         (ดู supabase/roles.sql) ส่งไปก็ถูกทิ้ง แต่การมีบรรทัด role อยู่ตรงนี้
         จะทำให้คนอ่านโค้ดเข้าใจผิดว่าฝั่งเบราว์เซอร์กำหนดสิทธิ์ได้ */
      const res = await SB.auth.signUp({
        email: email.trim(),
        password,
        options: { data: {
          username:  username.trim(),
          full_name: fullname.trim(),
          // เลือก "อื่น ๆ" → เก็บสิ่งที่พิมพ์เอง ไม่ใช่ค่า sentinel
          rank: rank === RANK_OTHER ? rankOther.trim() : rank,
        } },
      });
      err = res.error; data = res.data;
    } catch (e) { err = e; }
    setLoading(false);
    if (err) return setError(translateAuthError(err.message));

    if (data && data.session) return;   // Confirm email ปิด → เข้าระบบทันที

    // Confirm email เปิดอยู่ → บัญชีถูกสร้างแล้วแต่ยังใช้ไม่ได้จนกว่าจะยืนยัน
    setMode("login");
    setPassword(""); setConfirmPass("");
    setNotice(T("สมัครสำเร็จ — กรุณายืนยันอีเมลก่อน แล้วจึงเข้าสู่ระบบ",
                "Registered — please confirm your email, then sign in."));
  };

  const submit = () => {
    setError(""); setNotice("");
    if (!SB) return setError(T("เชื่อมต่อฐานข้อมูลไม่ได้", "Cannot reach the database"));
    return isReg ? handleRegister() : handleLogin();
  };

  const onEnter = (e) => { if (e.key === "Enter") submit(); };

  const switchMode = (k) => { setMode(k); setError(""); setNotice(""); };

  const TabBtn = ({ k, label }) => (
    <button onClick={() => switchMode(k)}
      className={"btn btn-sm " + (mode === k ? "btn-primary" : "btn-ghost")}
      style={{ flex: 1, justifyContent: "center", height: 34 }}>
      {label}
    </button>
  );

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
          <div className="row" style={{ gap: 13, marginBottom: 14 }}>
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
          <div style={{ display: "flex", gap: 7 }}>
            <TabBtn k="login"    label={T("เข้าสู่ระบบ", "Log In")} />
            <TabBtn k="register" label={T("สมัครใช้งาน", "Sign Up")} />
          </div>
        </div>

        <div style={{ padding: "20px 24px" }}>

          {isReg && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{T("ชื่อ-นามสกุล", "Full Name")}</label>
                <input type="text" value={fullname} onChange={e => setFullname(e.target.value)}
                  placeholder={T("กรอกชื่อ-นามสกุล", "Enter full name")} autoFocus style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{T("ยศ / ตำแหน่ง", "Rank / Position")}</label>
                <select value={rank} onChange={e => setRank(e.target.value)}
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  <option value="">{T("-- เลือกยศ --", "-- Select rank --")}</option>
                  {RANKS.map(r => (
                    <option key={r.v} value={r.v}>{r.v} ({r.full})</option>
                  ))}
                  <option value={RANK_OTHER}>{T("อื่น ๆ (โปรดระบุ)", "Other (please specify)")}</option>
                </select>
              </div>

              {rank === RANK_OTHER && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{T("ระบุยศ / ตำแหน่ง", "Specify rank / position")}</label>
                  <input type="text" value={rankOther} onChange={e => setRankOther(e.target.value)}
                    placeholder={T("เช่น พลเรือน, ที่ปรึกษา", "e.g. civilian, adviser")}
                    onKeyDown={onEnter} autoFocus style={inputStyle} />
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{T("ชื่อผู้ใช้", "Username")}</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder={T("ตั้งชื่อผู้ใช้ (อย่างน้อย 4 ตัวอักษร)", "Set username (min 4 chars)")}
                  style={inputStyle} />
              </div>
            </>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{T("อีเมล", "Email")}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoFocus={!isReg} placeholder={T("กรอกอีเมล", "Enter email")}
              onKeyDown={onEnter} style={inputStyle} />
          </div>

          <div style={{ marginBottom: isReg ? 14 : 18 }}>
            <label style={labelStyle}>{T("รหัสผ่าน", "Password")}</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={onEnter}
                placeholder={isReg ? T("ตั้งรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)", "Set password (min 6 chars)") : "••••••••"}
                style={{ ...inputStyle, paddingRight: 38 }} />
              <span onClick={() => setShowPass(s => !s)}
                title={T("แสดง/ซ่อนรหัสผ่าน", "Show / hide password")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}>
                <Icon name="eye" size={16} />
              </span>
            </div>
          </div>

          {isReg && (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>{T("ยืนยันรหัสผ่าน", "Confirm Password")}</label>
              <input type="password" value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                onKeyDown={onEnter} placeholder="••••••••"
                style={{ ...inputStyle,
                  borderColor: confirmPass && confirmPass !== password ? "var(--crit)" : undefined }} />
            </div>
          )}

          {notice && (
            <div style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 7,
              background: "rgba(var(--ok-rgb),0.1)", border: "1px solid rgba(var(--ok-rgb),0.3)",
              color: "var(--ok)", fontSize: "var(--fs-sm)", display: "flex", alignItems: "center", gap: 7,
            }}>
              <Icon name="check" size={13} />{notice}
            </div>
          )}

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
                {isReg ? T("กำลังสมัคร...", "Registering...") : T("กำลังเข้าสู่ระบบ...", "Signing in...")}</>
            ) : (
              <><Icon name="shield" size={15} />
                {isReg ? T("สมัครใช้งาน", "Sign Up") : T("เข้าสู่ระบบ", "Log In")}</>
            )}
          </button>

          <div style={{ marginTop: 12, textAlign: "center", fontSize: "var(--fs-xs)", color: "var(--text-mute)", lineHeight: 1.8 }}>
            {isReg ? (
              <>
                {T("บัญชีใหม่ได้สิทธิ์ “ผู้ใช้งาน” — ดูข้อมูลได้ แต่มอบหมายงานไม่ได้",
                   "New accounts get the “Operator” level — read-only, cannot assign")}
                <br />
                {T("ต้องการสิทธิ์สูงกว่านี้ ให้ผู้ดูแลระบบเลื่อนให้",
                   "Ask an administrator if you need more than that")}
                <br />
                {T("มีบัญชีแล้ว?", "Already have an account?")}{" "}
                <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => switchMode("login")}>{T("เข้าสู่ระบบ", "Log in")}</span>
              </>
            ) : (
              <>
                {T("ยังไม่มีบัญชี?", "No account yet?")}{" "}
                <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => switchMode("register")}>{T("สมัครใช้งาน", "Sign up")}</span>
              </>
            )}
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

Object.assign(window, { LoginScreen, MDA_ROLES, ROLE_LABEL, OFFICER_RANKS,
                        RANKS, RANK_OTHER, normRole, roleLabel, isOfficerRank, can });
