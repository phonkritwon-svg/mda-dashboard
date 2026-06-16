/* ============================================================
   App shell — top bar, sidebar nav, router, overlays
   ============================================================ */
const { useState: useStateA, useEffect: useEffectA, useCallback: useCallbackA } = React;

const ACCENTS = { amber: "#e3b341", blue: "#4d9bf0", green: "#46c976", cyan: "#33d6c8" };
const FONTS = {
  "IBM Plex Sans Thai": '"IBM Plex Sans Thai","IBM Plex Sans",system-ui,sans-serif',
  "Noto Sans Thai":     '"Noto Sans Thai",system-ui,sans-serif',
  "Sarabun":            '"Sarabun",system-ui,sans-serif',
  "Anuphan":            '"Anuphan",system-ui,sans-serif',
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "language": "th",
  "theme": "dark",
  "accent": "amber",
  "font": "IBM Plex Sans Thai",
  "density": "regular"
}/*EDITMODE-END*/;

const NAV = [
  { key: "dashboard", icon: "dashboard", th: "ภาพรวม",   en: "Overview" },
  { key: "map",       icon: "radar",     th: "แผนที่",    en: "Map" },
  { key: "osint",     icon: "feed",      th: "ฟีดข่าว",  en: "OSINT" },
  { key: "incident",  icon: "alert",     th: "เหตุการณ์", en: "Incidents", badge: 5 },
  { key: "brief",     icon: "brief",     th: "รายงาน",   en: "Brief" },
];

function Clock({ lang }) {
  const [now, setNow] = useStateA(new Date());
  useEffectA(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateStr = now.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB",
    { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="clock">
      <div className="t mono">
        {hh}:{mm}
        <span style={{ color: "var(--text-mute)", fontSize: 12 }}>:{ss}</span>{" "}
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>ICT</span>
      </div>
      <div className="d">{dateStr}</div>
    </div>
  );
}

function Toast({ msg, kind }) {
  if (!msg) return null;
  const palette = { info: "var(--info)", ok: "var(--ok)", warn: "var(--accent)", error: "var(--crit)" };
  const col = palette[kind] || palette.info;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "var(--surface-3)", border: "1px solid " + col,
      borderRadius: 9, padding: "10px 18px", fontSize: "var(--fs-sm)", fontWeight: 500,
      zIndex: 999, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 9,
      color: "var(--text)", minWidth: 240, maxWidth: 480,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, flex: "none",
        boxShadow: "0 0 8px " + col }}></span>
      {msg}
    </div>
  );
}

// สร้าง user object สำหรับแอปจาก Supabase session + profile
async function buildAppUser(session) {
  const SB = window.MDA_SB;
  const meta = (session.user && session.user.user_metadata) || {};
  let prof = null;
  try {
    if (SB) {
      const { data } = await SB.from("profiles").select("*").eq("id", session.user.id).single();
      prof = data;
    }
  } catch (e) { /* profile อาจยังไม่ถูกสร้าง — ใช้ metadata แทน */ }
  const name     = (prof && prof.full_name) || meta.full_name || meta.username || "ผู้ใช้";
  const username = (prof && prof.username)  || meta.username  || (session.user.email || "").split("@")[0];
  const rank     = (prof && prof.rank)      || meta.rank      || "";
  const role     = (prof && prof.role)      || meta.role      || "Operator";
  const avatar   = window.initialsOf ? window.initialsOf(name) : name.slice(0, 2);
  return { user: username, name, rank, role, avatar };
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useStateA({ screen: "dashboard", payload: null });
  const [notifOpen, setNotifOpen] = useStateA(false);
  const [searchOpen, setSearchOpen] = useStateA(false);
  const [toast, setToast] = useStateA(null);
  const [currentUser, setCurrentUser] = useStateA(null);
  const [authReady, setAuthReady] = useStateA(false);
  const lang = t.language;
  const T = (th, en) => (lang === "th" ? th : en);

  const showToast = useCallbackA((msg, kind) => {
    setToast({ msg, kind: kind || "info" });
    setTimeout(() => setToast(null), 3200);
  }, []);
  window._showToast = showToast;

  useEffectA(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-accent", t.accent);
    r.setAttribute("data-density", t.density);
    r.style.setProperty("--font-ui", FONTS[t.font] || FONTS["IBM Plex Sans Thai"]);
  }, [t.theme, t.accent, t.density, t.font]);

  useEffectA(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---- Supabase Auth session ----
  useEffectA(() => {
    const SB = window.MDA_SB;
    if (!SB) { setAuthReady(true); return; }   // ไม่มี Supabase → ไปหน้า login (demo ยังใช้ได้)
    let sub = null;
    (async () => {
      try {
        const { data: { session } } = await SB.auth.getSession();
        if (session) setCurrentUser(await buildAppUser(session));
      } catch (e) { /* ignore */ }
      setAuthReady(true);
      const res = SB.auth.onAuthStateChange(async (_event, sess) => {
        if (sess) setCurrentUser(await buildAppUser(sess));
        else setCurrentUser(null);
      });
      sub = res.data.subscription;
    })();
    return () => { if (sub) sub.unsubscribe(); };
  }, []);

  const onNav = (screen, payload) => {
    setNotifOpen(false);
    setRoute({ screen, payload: payload || null });
  };

  const openSettings = () => {
    window.postMessage({ type: "__activate_edit_mode" }, "*");
    showToast(T("เปิด Tweaks Panel แล้ว", "Tweaks panel opened"), "info");
  };

  const data = window.MDA_DATA;
  const screenProps = { data, lang, onNav, showToast };

  const screens = {
    dashboard: <window.Dashboard {...screenProps} />,
    map:       <window.MapScreen  {...screenProps} initial={route.payload} />,
    osint:     <window.Osint      {...screenProps} />,
    incident:  <window.Incident   {...screenProps} initial={route.payload} />,
    brief:     <window.DailyBrief {...screenProps} />,
  };

  // ---- Auth gate: ยังไม่ login → แสดงหน้าเข้าสู่ระบบ/สมัคร ----
  if (!currentUser) {
    const LS = window.LoginScreen;
    if (!authReady || !LS) {
      return <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center",
        background: "var(--bg)", color: "var(--text-dim)", fontFamily: "var(--font-ui)" }}>
        {T("กำลังโหลด…", "Loading…")}
      </div>;
    }
    return (
      <window.LangCtx.Provider value={lang}>
        <LS onLogin={(u) => {
          setCurrentUser(u);
          showToast(T("ยินดีต้อนรับ ", "Welcome ") + (u.rank ? u.rank + " " : "") + u.name, "ok");
        }} />
        <Toast msg={toast && toast.msg} kind={toast && toast.kind} />
      </window.LangCtx.Provider>
    );
  }

  return (
    <window.LangCtx.Provider value={lang}>
      <div className="app">

        {/* TOP BAR */}
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark"><Icon name="radar" size={18} /></div>
            <div>
              <div className="brand-title">MDA · Maritime Domain Awareness</div>
              <div className="brand-sub">ศูนย์บัญชาการข่าวทางทะเล · GLOBAL OSINT</div>
            </div>
          </div>

          <div className="region-pill">
            <span className="dot"></span>
            <Icon name="globe" size={13} style={{ color: "var(--text-dim)" }} />
            {T("ทั่วโลก · มหาสมุทรและช่องแคบหลัก", "Global · Seas & Chokepoints")}
          </div>

          <div className="topbar-spacer"></div>

          <div className="row" style={{ gap: 8 }}>
            <span className="flash"></span>
            <span className="dim" style={{ fontSize: "var(--fs-sm)" }}>
              {data.events.filter(e => !e.resolved).length} {T("เหตุการณ์สด", "live")}
            </span>
          </div>

          <div className="threatcon tc-elevated" title="Maritime Threat Condition">
            <div className="lvl">III</div>
            <div className="lbl">ELEVATED</div>
          </div>

          <Clock lang={lang} />

          <div className="row" style={{ gap: 6 }}>
            <div className="icon-btn" style={{ position: "relative" }}
              title={T("ศูนย์แจ้งเตือน", "Alert Center")}
              onClick={() => { setNotifOpen(o => !o); setSearchOpen(false); }}>
              <Icon name="bell" size={16} />
              <span className="nav-badge" style={{ top: -4, right: -4, position: "absolute" }}>3</span>
            </div>
            <div className="icon-btn"
              title={T("ค้นหา (Ctrl+K)", "Search (Ctrl+K)")}
              onClick={() => { setSearchOpen(true); setNotifOpen(false); }}>
              <Icon name="search" size={16} />
            </div>
            <div className="avatar" title={currentUser.rank + " " + currentUser.name + "\n" + currentUser.role + "\n(" + T("คลิกเพื่อออกจากระบบ", "click to sign out") + ")"}
              style={{ cursor: "pointer" }}
              onClick={async () => {
                if (window.confirm(T("ออกจากระบบ?", "Sign out?") + " (" + currentUser.name + ")")) {
                  try { if (window.MDA_SB) await window.MDA_SB.auth.signOut(); } catch (e) { /* ignore */ }
                  setCurrentUser(null);
                }
              }}>
              {currentUser.avatar || currentUser.name.charAt(0)}
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          {NAV.map(n => (
            <div key={n.key}
              className={"nav-item" + (route.screen === n.key ? " active" : "")}
              title={T(n.th, n.en)}
              onClick={() => onNav(n.key)}>
              <Icon name={n.icon} size={21} />
              <span className="nav-lbl">{T(n.th, n.en)}</span>
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </div>
          ))}
          <div className="sidebar-grow"></div>
          <div className="nav-item" title={T("ชั้นข้อมูล", "Data Layers")}>
            <Icon name="layers" size={21} />
            <span className="nav-lbl">{T("ชั้นข้อมูล", "Layers")}</span>
          </div>
          <div className="nav-item"
            title={T("ตั้งค่า / Tweaks Panel", "Settings / Tweaks")}
            onClick={openSettings}>
            <Icon name="settings" size={21} />
            <span className="nav-lbl">{T("ตั้งค่า", "Settings")}</span>
          </div>
        </div>

        {/* MAIN */}
        <div className="main"
          key={route.screen + (route.payload ? JSON.stringify(route.payload) : "")}>
          {screens[route.screen]}
        </div>

        {/* NOTIFICATION PANEL */}
        <window.NotifPanel
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          lang={lang}
          onNav={onNav}
        />

        {/* SEARCH / COMMAND PALETTE */}
        <window.SearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          lang={lang}
          data={data}
          onNav={onNav}
        />

        {/* TWEAKS */}
        <TweaksPanel title="Tweaks">
          <TweakSection label={T("ภาษา & ธีม", "Language & Theme")} />
          <TweakRadio label={T("ภาษา", "Language")} value={lang}
            options={["th", "en"]} onChange={(v) => setTweak("language", v)} />
          <TweakRadio label={T("โหมดสี", "Mode")} value={t.theme}
            options={["dark", "light"]} onChange={(v) => setTweak("theme", v)} />
          <TweakColor label={T("สีเน้น", "Accent")} value={ACCENTS[t.accent]}
            options={Object.values(ACCENTS)}
            onChange={(hex) => setTweak("accent",
              Object.keys(ACCENTS).find(k => ACCENTS[k] === hex) || "amber")} />
          <TweakSection label={T("การแสดงผล", "Display")} />
          <TweakSelect label={T("ฟอนต์", "Font")} value={t.font}
            options={Object.keys(FONTS)} onChange={(v) => setTweak("font", v)} />
          <TweakRadio label={T("ความหนาแน่น", "Density")} value={t.density}
            options={["regular", "compact"]} onChange={(v) => setTweak("density", v)} />
        </TweaksPanel>

        {/* TOAST */}
        <Toast msg={toast && toast.msg} kind={toast && toast.kind} />
      </div>
    </window.LangCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
