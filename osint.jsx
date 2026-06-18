/* ============================================================
   Screen: OSINT Feed + AI Summary
   ============================================================ */
const VERDICT = {
  corroborating: { kind: "ok",   th: "สอดคล้อง",     en: "CORROBORATING" },
  confirmed:     { kind: "ok",   th: "ยืนยันแล้ว",   en: "CONFIRMED" },
  partial:       { kind: "info", th: "บางส่วน",      en: "PARTIAL" },
  unverified:    { kind: "warn", th: "ยังไม่ยืนยัน", en: "UNVERIFIED" },
  context:       { kind: "mute", th: "บริบท",        en: "CONTEXT" },
};

function NewsRow({ n, lang, onNav }) {
  const T   = (th, en) => (lang === "th" ? th : en);
  const src = window.MDA_DATA.sources[n.srcKey];
  const vd  = VERDICT[n.verdict] || VERDICT.context;
  const domMeta = window.MDA_THREAT_DOMAINS || [];
  const domains = (window.classifyThreats ? window.classifyThreats(n) : [])
    .map(k => domMeta.find(d => d.key === k)).filter(Boolean);
  const geo = window.geocodeText
    ? window.geocodeText(n.raw && n.raw.en, n.raw && n.raw.th,
        n.ai && n.ai.en, n.ai && n.ai.th, n.outlet)
    : null;
  const agoStr = n.isLive
    ? window.mdaTimeAgo(n.time, lang)
    : tx(n.ago, lang);
  return (
    <div className="feed-row news-row" style={{ cursor: "pointer" }}
      onClick={() => onNav("newsDetail", { item: n })}>
      <div className="nhead">
        {src
          ? <SrcChip srcKey={n.srcKey} withName lang={lang} />
          : <span className="tag" style={{ color: src && src.color }}>{n.outlet || n.srcKey}</span>
        }
        {n.isLive && (
          <span className="tag" style={{
            background: "rgba(70,201,118,0.12)",
            color: "var(--ok)",
            border: "1px solid rgba(70,201,118,0.35)",
            fontSize: 9, letterSpacing: 1,
          }}>LIVE</span>
        )}
        <span className="tag mono" title="Admiralty reliability/credibility">{n.reliability}{n.credibility}</span>
        <Badge kind={vd.kind} dot>{T(vd.th, vd.en)}</Badge>
        {n.linkedInc && (
          <span className="tag" style={{ cursor: "pointer", color: "var(--accent)" }}
            onClick={(ev) => { ev.stopPropagation(); onNav("incident", { id: n.linkedInc }); }}>
            <Icon name="link" size={11} />{n.linkedInc}
          </span>
        )}
        <span className="topbar-spacer"></span>
        <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>{agoStr}</span>
      </div>
      <div className="ntitle">{tx(n.raw, lang)}</div>
      {domains.length > 0 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {domains.map(d => (
            <span key={d.key} className="tag" style={{
              fontSize: 9, color: d.color,
              background: d.color + "1e",
              border: "1px solid " + d.color + "55",
            }}>{T(d.th, d.en)}</span>
          ))}
        </div>
      )}
      {tx(n.ai, lang) && (
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "8px 10px",
          borderRadius: 7, background: "rgba(var(--accent-rgb),0.05)",
          border: "1px solid rgba(var(--accent-rgb),0.16)" }}>
          <span className="ai-chip" style={{ flex: "none" }}><Icon name="spark" size={12} />AI</span>
          <span className="nsum" style={{ color: "var(--text)" }}>{tx(n.ai, lang)}</span>
        </div>
      )}
      <div className="nfoot">
        <span className="row" style={{ gap: 5 }}><Icon name="clock" size={11} />{n.isLive ? new Date(n.time).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : n.time}</span>
        {n.outlet && <span className="row" style={{ gap: 5 }}><Icon name="globe" size={11} />{n.outlet}</span>}
        <span className="topbar-spacer"></span>
        {geo && (
          <a className="panel-link" style={{ cursor: "pointer" }}
            title={lang === "th" ? geo.th : geo.en}
            onClick={(ev) => {
              ev.stopPropagation();
              onNav("map", { focus: {
                lat: geo.lat, lon: geo.lon,
                label: lang === "th" ? geo.th : geo.en,
                title: tx(n.raw, lang),
              } });
            }}>
            <Icon name="pin" size={12} />{T("ดูบนแผนที่", "View on map")}
          </a>
        )}
        <a className="panel-link" href={n.url} target="_blank" rel="noopener noreferrer"
          onClick={(ev) => ev.stopPropagation()}>
          {T("เปิดข่าวต้นฉบับ", "Open original")}<Icon name="link" size={12} />
        </a>
      </div>
    </div>
  );
}

/* checkbox row ใช้ในโมดัลตัวกรอง (เลือกได้หลายรายการ) */
function FilterCheck({ checked, onToggle, color, label, count }) {
  const accent = color || "var(--accent)";
  return (
    <div className="pill-tab" role="checkbox" aria-checked={checked} onClick={onToggle}
      style={{ justifyContent: "space-between", display: "flex", alignItems: "center" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{
          width: 16, height: 16, borderRadius: 4, flex: "none",
          border: "1.5px solid " + (checked ? accent : "var(--border-2)"),
          background: checked ? accent : "transparent",
          color: "#0a0e15", fontSize: 11, fontWeight: 800, lineHeight: "14px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{checked ? "✓" : ""}</span>
        {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flex: "none" }}></span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </span>
      <span className="mono dim" style={{ flex: "none" }}>{count}</span>
    </div>
  );
}

function Osint({ data, lang, onNav }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const [filterOpen, setFilterOpen]   = useState(false);
  const [domSel, setDomSel]           = useState({});   // ภัยคุกคามที่ติ๊ก (ว่าง = ทุกด้าน)
  const [srcSel, setSrcSel]           = useState({});   // แหล่งข่าวที่ติ๊ก (ว่าง = ทุกแหล่ง)
  const [onlyLive, setOnlyLive]       = useState(false);
  const [onlyLinked, setOnlyLinked]   = useState(false);
  const toggleDom = (k) => setDomSel(s => ({ ...s, [k]: !s[k] }));
  const toggleSrc = (k) => setSrcSel(s => ({ ...s, [k]: !s[k] }));
  const clearAll  = () => { setDomSel({}); setSrcSel({}); setOnlyLive(false); setOnlyLinked(false); };

  const { news: allNews, liveCount, fetching, lastFetch, fetchError, doFetch } =
    window.useNewsUpdater(data.news);

  // ── เน้นเพื่อนบ้าน (กัมพูชา/พม่า/มาเลเซีย) — ดันขึ้นก่อน แต่ยังเห็นทั่วโลก ──
  const [focusOn, setFocusOn] = useState(true);

  // ── ช่วงเวลาที่สนใจ (time scope) ──────────────────────────────
  const [scope, setScope]             = useState({ key: "all", from: "", to: "" });
  const [archiveNews, setArchiveNews] = useState(null);   // ข่าวย้อนหลังจากคลัง
  const [scopeLoading, setScopeLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (scope.key === "all") { setArchiveNews(null); setScopeLoading(false); return; }
    const w = window.timeWindow(scope);
    if (scope.key === "custom" && !w.since && !w.until) { setArchiveNews(null); return; }
    setScopeLoading(true);
    Promise.resolve(window.queryNewsArchive
        ? window.queryNewsArchive(w.since && w.since.toISOString(), w.until && w.until.toISOString(), 2000)
        : [])
      .then(items => { if (active) { setArchiveNews(items); setScopeLoading(false); } })
      .catch(() => { if (active) { setArchiveNews(null); setScopeLoading(false); } });
    return () => { active = false; };
  }, [scope.key, scope.from, scope.to]);

  // รวมฟีดสด + คลังย้อนหลัง (dedupe by id) แล้วกรองตามช่วงเวลา
  const scopedNews = useMemo(() => {
    const w = window.timeWindow(scope);
    let pool = allNews;
    if (scope.key !== "all" && archiveNews) {
      const m = new Map();
      archiveNews.forEach(n => m.set(n.id, n));
      allNews.forEach(n => m.set(n.id, n));   // live ทับ archived
      pool = Array.from(m.values());
    }
    const filtered = scope.key === "all"
      ? pool
      : pool.filter(n => window.inTimeWindow(n.time, w.since, w.until));
    return filtered.slice().sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  }, [allNews, archiveNews, scope]);

  const domKeys = Object.keys(domSel).filter(k => domSel[k]);
  const srcKeys = Object.keys(srcSel).filter(k => srcSel[k]);
  const activeCount = domKeys.length + srcKeys.length + (onlyLive ? 1 : 0) + (onlyLinked ? 1 : 0);

  // เลือกหลายด้าน/หลายแหล่ง = OR ในกลุ่มเดียวกัน, AND ข้ามกลุ่ม; ไม่ติ๊ก = ไม่กรอง
  const news = scopedNews.filter(n => {
    if (onlyLive && !n.isLive) return false;
    if (onlyLinked && !n.linkedInc) return false;
    if (srcKeys.length && !srcKeys.includes(n.srcKey)) return false;
    if (domKeys.length) {
      const nd = window.classifyThreats ? window.classifyThreats(n) : [];
      if (!domKeys.some(k => nd.includes(k))) return false;
    }
    return true;
  });

  const srcCounts = {};
  scopedNews.forEach(n => { srcCounts[n.srcKey] = (srcCounts[n.srcKey] || 0) + 1; });

  const domCounts = {};
  scopedNews.forEach(n => (window.classifyThreats ? window.classifyThreats(n) : [])
    .forEach(k => { domCounts[k] = (domCounts[k] || 0) + 1; }));

  // จัดกลุ่ม: ข่าวเพื่อนบ้านขึ้นก่อน แล้วตามด้วยทั่วโลก
  const newsHay = (n) => [n.raw && n.raw.th, n.raw && n.raw.en,
    n.ai && n.ai.th, n.ai && n.ai.en, n.outlet].filter(Boolean).join(" ");
  const grouped = window.focusPartition(news, newsHay, focusOn);

  const lastFetchStr = lastFetch
    ? lastFetch.toLocaleTimeString(lang === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", paddingBottom: 16 }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">OSINT FUSION FEED</div>
          <div className="page-title">{T("ฟีดข่าวกรองเปิด + สรุปด้วย AI", "Open-Source Feed + AI Synthesis")}</div>
          <div className="page-sub">{T("รวมจากหลายแหล่ง ประมวลผลและจัดระดับความน่าเชื่อถืออัตโนมัติ", "Multi-source ingest, auto-scored for reliability & credibility")}</div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {fetching ? (
            <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>
              <span className="flash"></span> {T("กำลังดึงข่าว…", "Fetching…")}
            </span>
          ) : lastFetchStr ? (
            <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>
              {T("อัปเดตล่าสุด", "Updated")} {lastFetchStr}
              {fetchError && <span style={{ color: "var(--crit)", marginLeft: 6 }}>⚠</span>}
            </span>
          ) : fetchError ? (
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--crit)" }}>⚠ {T("ดึงข่าวไม่สำเร็จ", "Fetch failed")}</span>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={doFetch} disabled={fetching}
            title={T("รีเฟรชข่าว", "Refresh news")}>
            <Icon name="refresh" size={14} />{T("รีเฟรช", "Refresh")}
          </button>

          {/* Filters button → inline modal (news sources) */}
          <div style={{ position: "relative" }}>
            <button className={"btn btn-sm " + (filterOpen ? "btn-primary" : "btn-ghost")}
              onClick={() => setFilterOpen(o => !o)}>
              <Icon name="filter" size={14} />{T("ตัวกรอง", "Filters")}
              {activeCount > 0 && (
                <span className="mono" style={{
                  marginLeft: 5, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8,
                  background: "var(--accent)", color: "#0a0e15", fontSize: 10, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>{activeCount}</span>
              )}
            </button>

            {filterOpen && (
              <>
                <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 61, width: 286,
                  background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 11,
                  boxShadow: "var(--shadow)", padding: 8, maxHeight: "min(78vh, 560px)", overflowY: "auto",
                }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "2px 9px 6px" }}>
                    <span className="dim up" style={{ fontSize: 10 }}>{T("เลือกได้หลายรายการ", "Select one or more")}</span>
                    {activeCount > 0 && (
                      <span className="panel-link" style={{ fontSize: 11, cursor: "pointer" }} onClick={clearAll}>
                        {T("ล้างตัวกรอง", "Clear")}
                      </span>
                    )}
                  </div>

                  <div className="dim up" style={{ fontSize: 10, padding: "2px 9px 6px" }}>{T("ภัยคุกคาม 9 ด้าน · ศรชล.", "9 Threat Domains · Thai-MECC")}</div>
                  <div className="col" style={{ gap: 3 }}>
                    {(window.MDA_THREAT_DOMAINS || []).map(d => (
                      <FilterCheck key={d.key} checked={!!domSel[d.key]} onToggle={() => toggleDom(d.key)}
                        color={d.color} label={T(d.th, d.en)} count={domCounts[d.key] || 0} />
                    ))}
                  </div>

                  <div className="divider" style={{ margin: "8px 0" }}></div>
                  <div className="dim up" style={{ fontSize: 10, padding: "2px 9px 6px" }}>{T("แหล่งข่าว", "Sources")}</div>
                  <div className="col" style={{ gap: 3 }}>
                    {liveCount > 0 && (
                      <FilterCheck checked={onlyLive} onToggle={() => setOnlyLive(v => !v)}
                        color="var(--ok)" label={T("ข่าวสด", "Live feeds")} count={liveCount} />
                    )}
                    <FilterCheck checked={onlyLinked} onToggle={() => setOnlyLinked(v => !v)}
                      label={T("เชื่อมเหตุการณ์", "Linked to incident")} count={scopedNews.filter(n => n.linkedInc).length} />
                    <div className="divider" style={{ margin: "6px 0" }}></div>
                    {Object.entries(srcCounts).map(([k, c]) => {
                      const s = window.MDA_DATA.sources[k];
                      return (
                        <FilterCheck key={k} checked={!!srcSel[k]} onToggle={() => toggleSrc(k)}
                          color={s && s.color} label={(s && s.name) || k} count={c} />
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* time-period scope + neighbors focus */}
      <div className="row" style={{ marginBottom: 10, justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <window.TimeScopeBar scope={scope} onChange={setScope} lang={lang}
          loading={scopeLoading} count={news.length} />
        <window.FocusToggle on={focusOn} onChange={setFocusOn} lang={lang} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 330px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* center feed */}
        <Panel flush title={T("สตรีมข่าวกรอง", "Intelligence Stream")} icon="feed"
          action={<span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>{news.length} {T("รายการ", "items")}</span>}
          style={{ minHeight: 0 }}>
          <div className="feed scroll-y" style={{ height: "100%" }}>
            {!news.length && <div className="empty">{T("ไม่มีรายการในตัวกรองนี้", "No items for this filter")}</div>}
            {focusOn && grouped.focus.length > 0 && (
              <window.FocusGroupLabel kind="focus" lang={lang} count={grouped.focus.length} />
            )}
            {grouped.focus.map(n => <NewsRow key={n.id} n={n} lang={lang} onNav={onNav} />)}
            {focusOn && grouped.focus.length > 0 && grouped.rest.length > 0 && (
              <window.FocusGroupLabel kind="rest" lang={lang} count={grouped.rest.length} />
            )}
            {grouped.rest.map(n => <NewsRow key={n.id} n={n} lang={lang} onNav={onNav} />)}
          </div>
        </Panel>

        {/* right AI digest */}
        <div className="col" style={{ gap: 12, minHeight: 0, overflow: "auto" }}>
          <Panel icon="spark" title={T("AI สรุปประจำชั่วโมง", "AI Hourly Synthesis")}
            action={<span className="ai-chip"><Icon name="cpu" size={12} />auto</span>}>
            <div className="nsum" style={{ color: "var(--text)", lineHeight: 1.6 }}>
              {T(
                "ในรอบชั่วโมงที่ผ่านมา สัญญาณเด่นคือกลุ่มฮูตีส่งสัญญาณรื้อฟื้นการโจมตีในทะเลแดง (ยืนยันโดย UKMTO และ BIMCO) ขณะที่การโจมตีกองเรือเงาในทะเลดำ-บอลติกยังต่อเนื่อง และความตึงเครียดเกรย์โซนในทะเลจีนใต้ แนะนำยกระดับเฝ้าระวังสูงต่อเนื่องในจุดร้อนหลัก",
                "Over the past hour the dominant signals are the Houthis' threat to resume Red Sea attacks (UKMTO + BIMCO advisories), continued shadow-fleet strikes in the Black/Baltic Seas, and grey-zone tension in the South China Sea. Recommend sustaining elevated watch across the main chokepoints."
              )}
            </div>
            <div className="divider"></div>
            <div className="dim up" style={{ fontSize: 10, marginBottom: 8 }}>{T("คำสำคัญที่ตรวจพบ", "Detected entities")}</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {["Houthi", "Bab el-Mandeb", "Shadow fleet", "Scarborough Shoal", "Novorossiysk", "Subsea cable", "UKMTO", "Strait of Hormuz"].map(e => (
                <span key={e} className="tag">{e}</span>
              ))}
            </div>
          </Panel>

          <Panel title={T("แนวโน้มหัวข้อ (6 ชม.)", "Trending Topics (6h)")} icon="feed">
            {[
              { t: T("ภัยคุกคามทะเลแดง", "Red Sea threat"), n: 47, c: "var(--crit)" },
              { t: T("กองเรือเงา", "Shadow fleet"),          n: 34, c: "var(--accent)" },
              { t: T("สายเคเบิลใต้ทะเล", "Subsea cables"),  n: 19, c: "var(--info)" },
              { t: T("ทะเลจีนใต้", "South China Sea"),       n: 15, c: "var(--text-dim)" },
            ].map((r, i) => (
              <div className="srcbar" key={i}>
                <div className="nm" style={{ width: 120 }}>{r.t}</div>
                <div className="track"><div className="fill" style={{ width: (r.n / 47 * 100) + "%", background: r.c }}></div></div>
                <div className="ct">{r.n}</div>
              </div>
            ))}
          </Panel>

          <Panel title={T("คุณภาพข่าวกรอง", "Feed Quality")} icon="shield">
            <div className="row" style={{ gap: 14, alignItems: "center" }}>
              <Gauge value={74} size={84} label={T("เชื่อถือได้", "VERIFIED")} color="var(--ok)" />
              <div className="col" style={{ gap: 6, fontSize: "var(--fs-sm)", flex: 1 }}>
                <div className="row between"><span className="dim">{T("ยืนยัน/สอดคล้อง", "Corroborated")}</span><span className="mono">5</span></div>
                <div className="row between"><span className="dim">{T("รอตรวจสอบ", "Pending")}</span><span className="mono" style={{ color: "var(--accent)" }}>1</span></div>
                <div className="row between"><span className="dim">{T("บริบท", "Context")}</span><span className="mono">1</span></div>
              </div>
            </div>
          </Panel>

          <Panel title={T("ตำนานความน่าเชื่อถือ", "Admiralty Code")} icon="shield">
            <div className="kv" style={{ gridTemplateColumns: "auto 1fr", textAlign: "left" }}>
              <span className="k mono">A–F</span><span style={{ fontSize: "var(--fs-xs)" }} className="dim">{T("ความน่าเชื่อถือแหล่ง", "Source reliability")}</span>
              <span className="k mono">1–5</span><span style={{ fontSize: "var(--fs-xs)" }} className="dim">{T("ความน่าเชื่อข้อมูล", "Info credibility")}</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Osint, NewsRow, VERDICT });
