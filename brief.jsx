/* ============================================================
   Screen: Daily Brief (รายงานสรุปประจำวัน)
   ============================================================ */
function DailyBrief({ data, lang, onNav, showToast }) {
  const T = (th, en) => lang === "th" ? th : en;
  const b = data.brief;
  const [regenerating, setRegenerating] = useState(false);

  const handleRegen = () => {
    if (regenerating) return;
    setRegenerating(true);
    setTimeout(() => {
      setRegenerating(false);
      if (showToast) showToast(
        T("AI สร้างรายงานใหม่เรียบร้อย · ข้อมูล ณ เวลาปัจจุบัน",
          "AI regenerated the brief · data as of now"), "ok"
      );
    }, 2200);
  };

  const handleExportPDF = () => {
    if (showToast) showToast(
      T("กำลังเตรียม PDF — หน้าต่างพิมพ์จะเปิดขึ้น",
        "Preparing PDF — print dialog opening"), "info"
    );
    setTimeout(() => window.print(), 600);
  };

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <div className="eyebrow">DAILY MARITIME INTELLIGENCE BRIEF</div>
          <div className="page-title">{T("รายงานสรุปสถานการณ์ประจำวัน", "Daily Situation Brief")}</div>
          <div className="page-sub row" style={{ gap: 14 }}>
            <span>{tx(b.date, lang)}</span>
            <span className="badge badge-warn" style={{ textTransform: "none" }}>
              {b.classification}
            </span>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={handleRegen} disabled={regenerating}>
            <Icon name="refresh" size={14}
              style={regenerating ? { animation: "sweep 0.9s linear infinite" } : {}} />
            {regenerating
              ? T("กำลังสร้างรายงาน...", "Generating...")
              : T("สร้างใหม่ด้วย AI", "Regenerate (AI)")}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
            <Icon name="download" size={14} />{T("ส่งออก PDF", "Export PDF")}
          </button>
        </div>
      </div>

      {/* metric strip */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 12 }}>
        {b.metrics.map((m, i) => (
          <div className="stat" key={i}>
            <div className="k">{tx(m.k, lang)}</div>
            <div className="v" style={{
              fontSize: 26,
              color: i === 0 ? "var(--crit)" : i === 1 ? "var(--ok)" : "var(--text)",
            }}>{m.v}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>
        <div className="col" style={{ gap: 12 }}>

          {/* BLUF */}
          <Panel title={T("บทสรุปผู้บริหาร (BLUF)", "Bottom Line Up Front")} icon="target">
            <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 13 }}>
              <div className="nsum" style={{ color: "var(--text)", fontSize: "var(--fs-lg)", lineHeight: 1.7 }}>
                {regenerating
                  ? <span className="dim">{T("กำลังสร้างบทสรุปใหม่...", "Generating new summary...")}</span>
                  : tx(b.bluf, lang)}
              </div>
            </div>
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <span className="badge badge-warn"><span className="bdot"></span>ELEVATED</span>
              <span className="dim" style={{ fontSize: "var(--fs-sm)" }}>
                {T("ระดับการเฝ้าระวังโดยรวม", "Overall watch posture")}
              </span>
            </div>
          </Panel>

          {/* highlights */}
          <Panel title={T("ประเด็นสำคัญ", "Key Developments")} icon="alert" flush>
            <div className="feed">
              {b.highlights.map((h, i) => (
                <div className="feed-row" key={i}
                  style={{ gridTemplateColumns: "auto 1fr auto", cursor: "pointer" }}
                  onClick={() => onNav("incident", { id: h.inc })}>
                  <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3,
                    background: window.SEV[h.sev].color }}></div>
                  <div>
                    <div className="evt-title" style={{ fontSize: "var(--fs-base)" }}>
                      {tx(h, lang)}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 5 }}>
                      <SevBadge sev={h.sev} lang={lang} />
                      <span className="tag mono">{h.inc}</span>
                    </div>
                  </div>
                  <Icon name="chevR" size={15} style={{ color: "var(--text-mute)", alignSelf: "center" }} />
                </div>
              ))}
            </div>
          </Panel>

          {/* outlook */}
          <Panel title={T("การคาดการณ์ 24 ชั่วโมง", "24-Hour Outlook")} icon="globe">
            <div className="nsum" style={{ color: "var(--text)", lineHeight: 1.7 }}>
              {tx(b.outlook, lang)}
            </div>
          </Panel>
        </div>

        {/* right sidebar */}
        <div className="col" style={{ gap: 12 }}>
          <Panel title={T("ดัชนีภัยคุกคามรายภูมิภาค", "Threat Index by Region")} icon="shield">
            {[
              { a: T("ทะเลแดง / บับเอลมันเดบ", "Red Sea / Bab el-Mandeb"), v: 82, c: "var(--crit)" },
              { a: T("ทะเลจีนใต้", "South China Sea"),    v: 71, c: "var(--accent)" },
              { a: T("ทะเลดำ", "Black Sea"),              v: 68, c: "var(--accent)" },
              { a: T("ทะเลบอลติก", "Baltic Sea"),         v: 54, c: "var(--info)" },
              { a: T("อ่าวเอเดน / โซมาเลีย", "Gulf of Aden / Somali"), v: 46, c: "var(--info)" },
            ].map((r, i) => (
              <div key={i} style={{ marginBottom: 11 }}>
                <div className="row between" style={{ fontSize: "var(--fs-sm)", marginBottom: 5 }}>
                  <span>{r.a}</span>
                  <span className="mono" style={{ color: r.c }}>{r.v}</span>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: r.v + "%", background: r.c }}></div>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title={T("สถานะช่องแคบยุทธศาสตร์", "Chokepoint Status")} icon="wave">
            <div className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
              <span className="k">{T("บับเอลมันเดบ", "Bab el-Mandeb")}</span>
              <span className="v" style={{ color: "var(--crit)" }}>{T("เสี่ยงสูง", "HIGH RISK")}</span>
              <span className="k">{T("ช่องแคบฮอร์มุซ", "Strait of Hormuz")}</span>
              <span className="v" style={{ color: "var(--accent)" }}>{T("จำกัด", "RESTRICTED")}</span>
              <span className="k">{T("คลองสุเอซ", "Suez Canal")}</span>
              <span className="v" style={{ color: "var(--accent)" }}>{T("ลดลง", "REDUCED")}</span>
              <span className="k">{T("ช่องแคบมะละกา", "Malacca")}</span>
              <span className="v" style={{ color: "var(--ok)" }}>{T("ปกติ", "NORMAL")}</span>
              <span className="k">{T("บอลติก (สายเคเบิล)", "Baltic (cables)")}</span>
              <span className="v" style={{ color: "var(--info)" }}>{T("เฝ้าระวัง", "WATCH")}</span>
            </div>
          </Panel>

          <Panel title={T("กองเรือเฉพาะกิจ / พันธมิตร", "Task Forces / Partners")} icon="anchor">
            <div className="col" style={{ gap: 9 }}>
              {[
                { n: "CTF-153",          s: T("ทะเลแดง · ความมั่นคงทางทะเล", "Red Sea · maritime security"),   st: "active" },
                { n: "EUNAVFOR Aspides", s: T("คุ้มกันเรือพาณิชย์", "escorting merchant traffic"),            st: "active" },
                { n: "NATO Baltic Sentry",s:T("ลาดตระเวนสายเคเบิลใต้ทะเล", "undersea cable patrol"),         st: "active" },
                { n: "EUNAVFOR Atalanta",s: T("ต้านโจรสลัด · อ่าวเอเดน", "counter-piracy · Gulf of Aden"),    st: "standby" },
              ].map((a, i) => (
                <div key={i} className="row between">
                  <div className="row" style={{ gap: 9 }}>
                    <Icon name="ship" size={16} style={{ color: "var(--accent)" }} />
                    <div className="col">
                      <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>{a.n}</span>
                      <span className="mute" style={{ fontSize: "var(--fs-xs)" }}>{a.s}</span>
                    </div>
                  </div>
                  <span className={"badge badge-" + (a.st === "active" ? "ok" : "mute")} dot>
                    {a.st.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={T("การกระจาย", "Distribution")} icon="list">
            <div className="row wrap" style={{ gap: 6 }}>
              {["ศรชล.ส่วนกลาง", T("ศูนย์ยุทธการ", "JOC"),
                "UKMTO", "NATO MARCOM", "IMB PRC", "ReCAAP"].map(d => (
                <span key={d} className="tag">{d}</span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DailyBrief });
