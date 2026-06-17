/* ============================================================
   Screen: Daily Brief (รายงานสรุปประจำวัน)
   ============================================================ */
function DailyBrief({ data, lang, onNav, showToast }) {
  const T = (th, en) => lang === "th" ? th : en;
  const b = data.brief;
  const [regenerating, setRegenerating] = useState(false);

  // ---- ข้อมูลจริงจากฟีดข่าว + เหตุการณ์ ----
  const { news: feedNews, doFetch } = window.useNewsUpdater(data.news);
  const events = data.events || [];
  const vessels = window.extractVesselsFromNews ? window.extractVesselsFromNews(feedNews) : [];
  const watchVessels = vessels.filter(v => v.status !== "normal" && v.status !== "friendly");

  const sevRank = (n) => {
    const ks = window.classifyThreats ? window.classifyThreats(n) : [];
    if (ks.some(k => ["TERROR", "PIRACY", "WMD"].includes(k))) return 3;
    if (ks.some(k => ["DRUG", "HUMAN", "DISASTER", "SAR"].includes(k))) return 2;
    return ks.length ? 1 : 0;
  };
  const sevName = (r) => (r === 3 ? "critical" : r === 2 ? "high" : r === 1 ? "medium" : "low");

  // ประเด็นสำคัญ = ข่าวเด่นจากฟีด (เรียงตามความรุนแรง → ความใหม่)
  const highlights = feedNews.slice()
    .sort((a, c) => (sevRank(c) - sevRank(a)) || (new Date(c.time || 0) - new Date(a.time || 0)))
    .slice(0, 6);

  // ดัชนีภัยคุกคามรายภูมิภาค = นับข่าวต่อพื้นที่ (geocode)
  const regionCounts = {};
  feedNews.forEach(n => {
    const g = window.geocodeText
      ? window.geocodeText(n.raw && n.raw.en, n.raw && n.raw.th, n.ai && n.ai.en, n.ai && n.ai.th, n.outlet)
      : null;
    if (g) { const key = lang === "th" ? g.th : g.en; regionCounts[key] = (regionCounts[key] || 0) + 1; }
  });
  const maxRegion = Math.max(1, ...Object.values(regionCounts));
  const regions = Object.entries(regionCounts)
    .sort((a, c) => c[1] - a[1]).slice(0, 6)
    .map(([a, c]) => {
      const v = Math.round(c / maxRegion * 100);
      return { a, v, n: c, c: v >= 75 ? "var(--crit)" : v >= 50 ? "var(--accent)" : "var(--info)" };
    });

  // สถิติจริง
  const metrics = [
    { k: { th: "เหตุการณ์", en: "Events" },           v: events.length },
    { k: { th: "ปิดเหตุแล้ว", en: "Resolved" },        v: events.filter(e => e.resolved).length },
    { k: { th: "เรือเฝ้าระวัง", en: "Vessels of interest" }, v: watchVessels.length },
    { k: { th: "ข่าว OSINT ประมวลผล", en: "OSINT items" },   v: feedNews.length },
  ];

  // วันที่จริง (วันนี้)
  const todayStr = new Date().toLocaleDateString(lang === "th" ? "th-TH" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" });

  // BLUF สร้างจากข้อมูลจริง
  const topRegions = regions.slice(0, 3).map(r => r.a);
  const blufText = T(
    "ประมวลผลข่าวกรองเปิด " + feedNews.length + " ชิ้น และติดตามเหตุการณ์ " + events.length +
    " รายการในรอบล่าสุด จุดร้อนหลัก: " + (topRegions.join(" · ") || "—") +
    " · ระดับการเฝ้าระวังโดยรวมอยู่ที่ ELEVATED",
    feedNews.length + " OSINT items processed and " + events.length +
    " events tracked this cycle. Main hotspots: " + (topRegions.join(" · ") || "—") +
    ". Overall posture: ELEVATED."
  );

  // ประเด็นภัยคุกคามเด่นจากฟีด → ใช้ในส่วนคาดการณ์
  const domCount = {};
  feedNews.forEach(n => (window.classifyThreats ? window.classifyThreats(n) : []).forEach(k => { domCount[k] = (domCount[k] || 0) + 1; }));
  const domMeta = window.MDA_THREAT_DOMAINS || [];
  const topDomains = Object.entries(domCount).sort((a, c) => c[1] - a[1]).slice(0, 3)
    .map(([k]) => { const d = domMeta.find(x => x.key === k); return d ? (lang === "th" ? d.th : d.en) : k; });
  const outlookText = T(
    "คาดว่ากิจกรรมในจุดร้อนหลักยังต่อเนื่อง ประเด็นที่ต้องเฝ้าระวัง: " + (topDomains.join(" · ") || "—") +
    " · แนะนำคงระดับเฝ้าระวังและตรวจสอบยืนยันข่าวจากหลายแหล่ง",
    "Hotspot activity is expected to persist. Watch items: " + (topDomains.join(" · ") || "—") +
    ". Maintain elevated watch and corroborate across sources."
  );

  const handleRegen = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try { if (doFetch) await doFetch(); } catch (e) { /* ignore */ }
    setRegenerating(false);
    if (showToast) showToast(
      T("ดึงข่าวล่าสุดและสร้างรายงานใหม่แล้ว",
        "Refreshed feed & rebuilt the brief"), "ok"
    );
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
            <span>{todayStr}</span>
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
        {metrics.map((m, i) => (
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
                  : blufText}
              </div>
            </div>
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <span className="badge badge-warn"><span className="bdot"></span>ELEVATED</span>
              <span className="dim" style={{ fontSize: "var(--fs-sm)" }}>
                {T("ระดับการเฝ้าระวังโดยรวม", "Overall watch posture")}
              </span>
            </div>
          </Panel>

          {/* highlights — ข่าวเด่นจากฟีดจริง */}
          <Panel title={T("ประเด็นสำคัญ", "Key Developments")} icon="alert" flush
            action={<a className="panel-link" onClick={() => onNav("osint")}>{T("ดูฟีด", "Open feed")}<Icon name="chevR" size={12} /></a>}>
            <div className="feed">
              {highlights.length === 0 && (
                <div className="empty">{T("ยังไม่มีข่าวในฟีด", "No items in the feed yet")}</div>
              )}
              {highlights.map((n) => {
                const sev = sevName(sevRank(n));
                const timeStr = n.isLive ? window.mdaTimeAgo(n.time, lang) : (typeof n.ago === "object" ? tx(n.ago, lang) : (n.time || ""));
                return (
                  <div className="feed-row" key={n.id}
                    style={{ gridTemplateColumns: "auto 1fr auto", cursor: "pointer" }}
                    onClick={() => onNav("newsDetail", { item: n })}>
                    <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3,
                      background: window.SEV[sev].color }}></div>
                    <div>
                      <div className="evt-title" style={{ fontSize: "var(--fs-base)" }}>
                        {tx(n.raw, lang)}
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                        <SevBadge sev={sev} lang={lang} />
                        {window.MDA_DATA.sources[n.srcKey]
                          ? <SrcChip srcKey={n.srcKey} withName lang={lang} />
                          : <span className="tag">{n.outlet || n.srcKey}</span>}
                        <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>{timeStr}</span>
                      </div>
                    </div>
                    <Icon name="chevR" size={15} style={{ color: "var(--text-mute)", alignSelf: "center" }} />
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* outlook */}
          <Panel title={T("การคาดการณ์ 24 ชั่วโมง", "24-Hour Outlook")} icon="globe">
            <div className="nsum" style={{ color: "var(--text)", lineHeight: 1.7 }}>
              {outlookText}
            </div>
          </Panel>
        </div>

        {/* right sidebar */}
        <div className="col" style={{ gap: 12 }}>
          <Panel title={T("ดัชนีภัยคุกคามรายภูมิภาค", "Threat Index by Region")} icon="shield"
            action={<span className="dim mono" style={{ fontSize: "var(--fs-xs)" }}>{T("จากฟีดข่าว", "from feed")}</span>}>
            {regions.length === 0 && (
              <div className="dim" style={{ fontSize: "var(--fs-sm)" }}>{T("ยังไม่มีข้อมูลพื้นที่จากข่าว", "No regional signals yet")}</div>
            )}
            {regions.map((r, i) => (
              <div key={i} style={{ marginBottom: 11 }}>
                <div className="row between" style={{ fontSize: "var(--fs-sm)", marginBottom: 5 }}>
                  <span>{r.a} <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>· {r.n} {T("ข่าว", "items")}</span></span>
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
