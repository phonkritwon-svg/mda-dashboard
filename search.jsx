/* ============================================================
   Command Palette / Global Search  (Ctrl+K)
   ============================================================ */
/* พื้นที่ทางทะเลสำหรับ "โฟกัสการค้นหาตามภูมิภาค" — ค้นทั่วโลกเสมอ
   แต่ถ้าเลือกภูมิภาค ผลในพื้นที่นั้นจะถูกดันขึ้นก่อน (rest = ที่อื่นทั่วโลก) */
// โฟกัสเพื่อนบ้าน (เขมร·พม่า·มาเลย์) — ใช้เป็นค่าเริ่มต้นของการค้นหา
const FOCUS_NEIGHBORS_REGION = {
  th: "เพื่อนบ้าน (เขมร·พม่า·มาเลย์)", en: "Neighbors (KH·MM·MY)",
  rx: window.FOCUS_RE || /cambodia|cambodian|khmer|myanmar|burma|malaysia|malaysian|malacca/i,
};
const SEARCH_REGIONS = [
  FOCUS_NEIGHBORS_REGION,
  ...((window.FOCUS_COUNTRIES || []).map(c => ({ th: c.th, en: c.en, rx: c.rx }))),
  { th: "ทะเลจีนใต้",        en: "South China Sea",        rx: /south china sea|scarborough|spratly|paracel|second thomas|natuna|ทะเลจีนใต้|นาตูนา|สแปรตลี|สการ์โบโร/i },
  { th: "อ่าวไทย",          en: "Gulf of Thailand",       rx: /gulf of thailand|อ่าวไทย/i },
  { th: "ทะเลอันดามัน",      en: "Andaman Sea",            rx: /andaman|อันดามัน/i },
  { th: "ช่องแคบมะละกา",     en: "Strait of Malacca",      rx: /malacca|singapore strait|มะละกา|สิงคโปร์/i },
  { th: "ทะเลแดง / บับเอลมันเดบ", en: "Red Sea / Bab el-Mandeb", rx: /red sea|bab[- ]?el[- ]?mandeb|houthi|hodeida|yemen|ทะเลแดง|บับเอลมันเดบ|ฮูตี|เยเมน/i },
  { th: "ช่องแคบฮอร์มุซ",    en: "Strait of Hormuz",       rx: /hormuz|fujairah|persian gulf|ฮอร์มุซ/i },
  { th: "อ่าวเอเดน",        en: "Gulf of Aden",           rx: /gulf of aden|\baden\b|เอเดน/i },
  { th: "ทะเลดำ",          en: "Black Sea",              rx: /black sea|novorossiysk|odes[as]|crimea|ทะเลดำ|ไครเมีย/i },
  { th: "ทะเลบอลติก",       en: "Baltic Sea",             rx: /baltic|gulf of finland|gotland|บอลติก/i },
  { th: "ทะเลเมดิเตอร์เรเนียน", en: "Mediterranean",       rx: /mediterranean|aegean|libya|gaza|เมดิเตอร์เรเนียน/i },
  { th: "อ่าวกินี",         en: "Gulf of Guinea",         rx: /gulf of guinea|nigeria|lagos|กินี/i },
  { th: "ทะเลแคริบเบียน",    en: "Caribbean",              rx: /caribbean|venezuela|panama canal|แคริบเบียน|เวเนซุเอลา/i },
];

function SearchPalette({ open, onClose, lang, data, onNav }) {
  const [q, setQ] = React.useState("");
  const [region, setRegion] = React.useState(FOCUS_NEIGHBORS_REGION);   // ค่าเริ่มต้น: เน้นเพื่อนบ้าน (null = ทั่วโลก)
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
  const qActive = ql.length >= 2;

  // haystack รวมสองภาษา → จับคู่ภูมิภาคได้ไม่ว่าสลับ th/en
  const both = (o) => o ? [o.th, o.en].filter(Boolean).join(" ") : "";
  const vHay = (v) => [v.name, v.id, v.flag, both(v.region), both(v.area)].join(" ");
  const eHay = (e) => [both(e.title), e.id, e.cat, both(e.region), both(e.area)].join(" ");
  const nHay = (n) => [both(n.raw), n.outlet].join(" ");
  const inRegion = (hay) => region ? region.rx.test(hay) : false;

  // จัดอันดับ: ค้นทั่วโลกเสมอ แล้วแยกผลในพื้นที่ที่โฟกัสขึ้นก่อน
  //   qActive  → กรองด้วยคำค้น (global) แล้วแยกใน-พื้นที่ / ที่อื่น
  //   !qActive → ถ้าเลือกภูมิภาค: เรียกดูล่าสุดในพื้นที่นั้น (rest ว่าง)
  const split = (list, queryFilter, hayFn) => {
    let base;
    if (qActive) base = list.filter(queryFilter);
    else if (region) base = list.filter(x => inRegion(hayFn(x)));
    else return { inR: [], rest: [] };
    if (!region) return { inR: base, rest: [] };
    if (!qActive) return { inR: base, rest: [] };
    return {
      inR:  base.filter(x => inRegion(hayFn(x))),
      rest: base.filter(x => !inRegion(hayFn(x))),
    };
  };

  const V = split(data.vessels,
    v => v.name.toLowerCase().includes(ql) || v.id.toLowerCase().includes(ql), vHay);
  const E = split(data.events,
    e => tx(e.title, lang).toLowerCase().includes(ql) || e.id.toLowerCase().includes(ql) ||
         e.cat.toLowerCase().includes(ql), eHay);
  const N = split(data.news,
    n => tx(n.raw, lang).toLowerCase().includes(ql) || (n.outlet && n.outlet.toLowerCase().includes(ql)), nHay);

  const hasResults = (V.inR.length + V.rest.length + E.inR.length + E.rest.length +
                      N.inR.length + N.rest.length) > 0;
  const browsing = !qActive && !!region;   // เลือกภูมิภาคโดยยังไม่พิมพ์ → เรียกดูในพื้นที่

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

  // เส้นคั่น "ที่อื่นทั่วโลก" ระหว่างผลในพื้นที่ที่โฟกัส กับผลส่วนที่เหลือ
  const RestDivider = () => (
    <div style={{ padding: "5px 16px 2px", fontSize: 9, letterSpacing: "0.08em",
      color: "var(--text-mute)", fontFamily: "var(--font-mono)", opacity: 0.7,
      display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }}></span>
      {T("ที่อื่นทั่วโลก", "ELSEWHERE · GLOBAL")}
      <span style={{ flex: 1, height: 1, background: "var(--border)" }}></span>
    </div>
  );

  // เติมรายการในพื้นที่ก่อนจนเต็ม max แล้วค่อยเติมส่วนที่เหลือ
  const take = (g, max) => {
    const inR = g.inR.slice(0, max);
    return { inR, rest: g.rest.slice(0, Math.max(0, max - inR.length)) };
  };

  const vesselRow = (v) => (
    <Row key={v.id}
      icon="ship"
      iconColor={window.VTYPE[v.type] ? window.VTYPE[v.type].color : "var(--text-dim)"}
      primary={v.name}
      secondary={v.id + " · " + (window.VTYPE[v.type] ? tx(window.VTYPE[v.type].label, lang) : "") + " · " + v.flag}
      right={
        <span className={"badge " + (
          v.status === "critical" ? "badge-crit" :
          v.status === "watch" ? "badge-warn" :
          v.status === "friendly" ? "badge-ok" : "badge-mute"
        )}>{v.status.toUpperCase()}</span>
      }
      onClick={() => { onNav("map", { vessel: v }); onClose(); }}
    />
  );

  const eventRow = (e) => (
    <Row key={e.id}
      icon="alert"
      iconColor={window.SEV[e.sev] ? window.SEV[e.sev].color : "var(--text-dim)"}
      primary={tx(e.title, lang)}
      secondary={e.id + " · " + e.cat + " · " + tx(e.region, lang)}
      right={<SevBadge sev={e.sev} lang={lang} />}
      onClick={() => { onNav("incident", { id: e.id }); onClose(); }}
    />
  );

  const newsRow = (n) => (
    <Row key={n.id}
      icon="feed"
      primary={tx(n.raw, lang)}
      secondary={(n.outlet || "") + " · " + tx(n.ago, lang)}
      onClick={() => { onNav("osint"); onClose(); }}
    />
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

        {/* region focus chips — ค้นทั่วโลก แต่ดันผลในพื้นที่ที่เลือกขึ้นก่อน */}
        <div style={{ display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderBottom: "1px solid var(--border)",
          overflowX: "auto", whiteSpace: "nowrap" }}>
          <Icon name="globe" size={13} style={{ color: "var(--text-dim)", flex: "none" }} />
          {[null, ...SEARCH_REGIONS].map((r, i) => {
            const active = (r === null && !region) || (r && region && r.en === region.en);
            return (
              <button key={i} onClick={() => setRegion(r)}
                title={r ? T("โฟกัสผลในพื้นที่นี้ (ยังค้นทั่วโลก)", "Focus results here (still searches globally)")
                         : T("ค้นทั่วโลก ไม่โฟกัสพื้นที่", "Search globally, no focus")}
                style={{
                  flex: "none", cursor: "pointer", fontSize: 11, lineHeight: 1.4,
                  padding: "3px 9px", borderRadius: 999,
                  fontFamily: "var(--font-ui)",
                  border: "1px solid " + (active ? "var(--accent)" : "var(--border-2)"),
                  background: active ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-dim)",
                  fontWeight: active ? 600 : 400,
                }}>
                {r ? T(r.th, r.en) : T("ทั่วโลก", "Global")}
              </button>
            );
          })}
        </div>

        {/* results */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Quick actions — ตอนยังไม่พิมพ์ และไม่ได้โฟกัสภูมิภาค */}
          {ql.length === 0 && !browsing && (
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

          {/* แถบบอกสถานะการโฟกัสภูมิภาค */}
          {region && (
            <div style={{ padding: "9px 16px 4px", fontSize: "var(--fs-xs)", color: "var(--text-dim)",
              display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="radar" size={12} style={{ color: "var(--accent)" }} />
              {browsing
                ? T("ล่าสุดในพื้นที่ ", "Latest in ") + T(region.th, region.en)
                : T("โฟกัส ", "Focused on ") + T(region.th, region.en) + T(" · ผลในพื้นที่ขึ้นก่อน", " · in-area results first")}
            </div>
          )}

          {/* No results */}
          {((qActive && !hasResults) || (browsing && !hasResults)) && (
            <div className="empty">
              {qActive
                ? T("ไม่พบผลลัพธ์สำหรับ", "No results for") + ' "' + q + '"'
                : T("ยังไม่มีรายการในพื้นที่นี้", "No recent items in this region")}
            </div>
          )}

          {/* Vessels */}
          {(V.inR.length + V.rest.length) > 0 && (() => {
            const g = take(V, 5);
            return (
              <div>
                <SectionLabel label={T("เรือ", "Vessels")} count={V.inR.length + V.rest.length} />
                {g.inR.map(vesselRow)}
                {g.rest.length > 0 && <RestDivider />}
                {g.rest.map(vesselRow)}
              </div>
            );
          })()}

          {/* Incidents */}
          {(E.inR.length + E.rest.length) > 0 && (() => {
            const g = take(E, 5);
            return (
              <div>
                <SectionLabel label={T("เหตุการณ์", "Incidents")} count={E.inR.length + E.rest.length} />
                {g.inR.map(eventRow)}
                {g.rest.length > 0 && <RestDivider />}
                {g.rest.map(eventRow)}
              </div>
            );
          })()}

          {/* News */}
          {(N.inR.length + N.rest.length) > 0 && (() => {
            const g = take(N, 4);
            return (
              <div>
                <SectionLabel label={T("ข่าวกรอง OSINT", "OSINT Intelligence")} count={N.inR.length + N.rest.length} />
                {g.inR.map(newsRow)}
                {g.rest.length > 0 && <RestDivider />}
                {g.rest.map(newsRow)}
              </div>
            );
          })()}
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
