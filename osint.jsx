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

/* ============================================================
   สรุปรอบชั่วโมง — คำนวณจากข่าวจริงในฟีด ไม่ใช่ข้อความสำเร็จรูป

   ของเดิมเป็นย่อหน้าฮาร์ดโค้ดเรื่องฮูตี/ทะเลแดง/กองเรือเงา พร้อมป้าย
   "คำสำคัญที่ตรวจพบ" ที่ตายตัวแปดคำ — ไม่เคยเปลี่ยนตามข่าวเลยสักครั้ง
   แดชบอร์ดข่าวกรองที่รายงานสิ่งที่ไม่ได้ตรวจพบจริงอันตรายกว่าไม่รายงาน

   ใช้กฎชุดเดียวกับที่หน้าอื่นใช้อยู่แล้ว (classifyThreats + geocodeNews)
   ผลจึงตรงกับตัวกรองด้านซ้ายและหมุดบนแผนที่เสมอ
   ============================================================ */

/* ถ้าชั่วโมงล่าสุดไม่มีข่าว ให้ถอยหน้าต่างออกทีละขั้นแทนที่จะโชว์แผงว่าง
   ฟีดรีเฟรชทุก 30 นาที และข่าวทางน้ำของไทยมีวันละไม่กี่ชิ้น ชั่วโมงที่ว่าง
   จึงเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด — แต่ต้องบอกช่วงเวลาจริงที่ใช้เสมอ */
const DIGEST_WINDOWS = [
  { hours: 1,  th: "1 ชั่วโมงล่าสุด",  en: "Past hour" },
  { hours: 6,  th: "6 ชั่วโมงล่าสุด",  en: "Past 6 hours" },
  { hours: 24, th: "24 ชั่วโมงล่าสุด", en: "Past 24 hours" },
];
const DIGEST_MIN_ITEMS = 3;

function digestWindow(newsArr) {
  const now = Date.now();
  const at = (n) => new Date(n.time || 0).getTime();
  for (const w of DIGEST_WINDOWS) {
    const since = now - w.hours * 3600 * 1000;
    const items = newsArr.filter(n => at(n) >= since);
    if (items.length >= DIGEST_MIN_ITEMS) return { ...w, items };
  }
  /* ยังไม่ถึงเกณฑ์แม้ใน 24 ชม. → ใช้ข่าวล่าสุดเท่าที่มี และบอกตามตรงว่า
     นี่ไม่ใช่ "รอบชั่วโมง" แล้ว */
  const latest = newsArr.slice(0, 20);
  return { hours: null, th: "ช่วงล่าสุดเท่าที่มีข้อมูล", en: "Latest available", items: latest };
}

/* นับแบบ {key: count} แล้วเรียงมาก→น้อย คืนเป็น [[key, count], …] */
function digestRank(items, keysOf) {
  const c = {};
  items.forEach(n => (keysOf(n) || []).forEach(k => { if (k) c[k] = (c[k] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

function buildHourlyDigest(newsArr, lang) {
  const T = (th, en) => (lang === "th" ? th : en);
  const win = digestWindow(newsArr || []);
  const items = win.items;
  const label = lang === "th" ? win.th : win.en;

  if (!items.length) {
    return { label, count: 0, entities: [], domains: [], regions: [],
      text: T("ยังไม่มีข่าวเข้าฟีดในช่วงนี้ — กดรีเฟรชเพื่อดึงรอบใหม่",
              "No items have reached the feed in this window - refresh to pull a new cycle") };
  }

  const domMeta = window.MDA_THREAT_DOMAINS || [];
  const domName = (k) => {
    const d = domMeta.find(x => x.key === k);
    return d ? (lang === "th" ? d.th : d.en) : k;
  };
  const domains = digestRank(items, n => (window.classifyThreats ? window.classifyThreats(n) : []));

  /* พื้นที่ — ใช้ตัวจับคู่ตัวเดียวกับแผนที่ และเอาเฉพาะที่ระบุได้จริง
     status "conflict"/ไม่มีพิกัด แปลว่าตัดสินไม่ได้ ไม่ใช่พื้นที่ที่ยืนยันแล้ว */
  const regions = digestRank(items, n => {
    const g = window.geocodeNews ? window.geocodeNews(n) : null;
    return g && g.lat != null ? [lang === "th" ? g.th : g.en] : [];
  });

  const outlets = digestRank(items, n => [n.outlet]);

  const topDom = domains.slice(0, 3).map(([k, c]) => domName(k) + " (" + c + ")");
  const topReg = regions.slice(0, 3).map(([k, c]) => k + " (" + c + ")");

  /* ขึ้นต้นด้วยชื่อช่วงเวลาเสมอ แล้วคั่นด้วย "·" — ใช้ได้กับทุกป้ายรวมทั้ง
     ตัวสำรอง ไม่ต้องพึ่งคำเชื่อมที่เข้ากับบางป้ายเท่านั้น */
  const text = T(
    label + " · ข่าวเข้าฟีด " + items.length + " ชิ้น จาก " + outlets.length + " สำนักข่าว"
      + (topDom.length ? " · ประเด็นเด่น: " + topDom.join(" · ") : " · ยังจัดกลุ่มภัยคุกคามไม่ได้")
      + (topReg.length ? " · พื้นที่ที่ระบุได้: " + topReg.join(" · ")
                       : " · ยังระบุพื้นที่จากเนื้อข่าวไม่ได้"),
    label + " · " + items.length + " items from " + outlets.length + " outlets"
      + (topDom.length ? ". Leading themes: " + topDom.join(", ") : ". No threat domain matched yet")
      + (topReg.length ? ". Located: " + topReg.join(", ")
                       : ". No location could be resolved from the text")
  );

  /* "คำสำคัญที่ตรวจพบ" ต้องเป็นสิ่งที่ตรวจพบจริงในรอบนี้ — ชื่อด้านภัยคุกคาม
     ที่กฎจับได้ บวกชื่อพื้นที่ที่ระบุพิกัดได้ ไม่ใช่รายการคงที่ */
  const entities = [].concat(
    domains.slice(0, 4).map(([k]) => domName(k)),
    regions.slice(0, 4).map(([k]) => k)
  );

  return { label, count: items.length, entities, domains, regions, outlets, text };
}

function NewsRow({ n, lang, onNav }) {
  const T   = (th, en) => (lang === "th" ? th : en);
  const src = window.MDA_DATA.sources[n.srcKey];
  const vd  = VERDICT[n.verdict] || VERDICT.context;
  const domMeta = window.MDA_THREAT_DOMAINS || [];
  const domains = (window.classifyThreats ? window.classifyThreats(n) : [])
    .map(k => domMeta.find(d => d.key === k)).filter(Boolean);
  const geo = window.geocodeNews ? window.geocodeNews(n) : null;
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
        {/* ต้องมีพิกัดจริงถึงจะเสนอปุ่มนี้ — สถานะ conflict มีชื่อพื้นที่แต่ lat เป็น null
            ถ้าโชว์ปุ่มไว้ กดแล้วแผนที่จะกระโดดไป NaN แล้วค้าง */}
        {geo && geo.lat != null && (
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
  // ตั้งใจให้เริ่มที่ปิด: ฟีดเปิดมาเป็นลำดับเวลาปกติ แล้วค่อยกดเปิดเองจาก FocusToggle
  // (จอแผนที่กับเหตุการณ์มีตรรกะเน้นเพื่อนบ้านแยกของตัวเอง ไม่ได้ผูกกับค่านี้)
  const [focusOn, setFocusOn] = useState(false);

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

  /* สรุปรอบชั่วโมง + แนวโน้ม 6 ชม. — คิดจาก allNews (ทั้งฟีด) ไม่ใช่ news
     ที่ถูกตัวกรองด้านซ้ายหั่นไปแล้ว มิฉะนั้นการติ๊กกรองแหล่งข่าวหนึ่งแหล่ง
     จะทำให้ "สรุปรอบชั่วโมง" เปลี่ยนตาม ทั้งที่มันควรสรุปสถานการณ์ทั้งหมด */
  const digest = React.useMemo(() => buildHourlyDigest(allNews, lang), [allNews, lang]);
  const trend6h = React.useMemo(() => {
    const since = Date.now() - 6 * 3600 * 1000;
    const recent = allNews.filter(n => new Date(n.time || 0).getTime() >= since);
    const domMeta = window.MDA_THREAT_DOMAINS || [];
    return digestRank(recent, n => (window.classifyThreats ? window.classifyThreats(n) : []))
      .slice(0, 4)
      .map(([k, c]) => {
        const d = domMeta.find(x => x.key === k);
        return { t: d ? (lang === "th" ? d.th : d.en) : k, n: c, c: (d && d.color) || "var(--text-dim)" };
      });
  }, [allNews, lang]);

  /* คุณภาพข่าวกรอง — นับ verdict จริงของข่าวในฟีด */
  const quality = React.useMemo(() => {
    const c = { ok: 0, pending: 0, context: 0 };
    allNews.forEach(n => {
      const kind = (VERDICT[n.verdict] || VERDICT.unverified).kind;
      if (kind === "ok") c.ok++;
      else if (kind === "mute") c.context++;
      else c.pending++;
    });
    const total = allNews.length || 1;
    return { ...c, pct: Math.round(c.ok / total * 100) };
  }, [allNews]);

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
          <Panel icon="spark" title={T("สรุปรอบล่าสุด", "Latest Cycle Synthesis")}
            action={<span className="ai-chip"><Icon name="cpu" size={12} />{digest.label}</span>}>
            <div className="nsum" style={{ color: "var(--text)", lineHeight: 1.6 }}>
              {digest.text}
            </div>
            {digest.entities.length > 0 && (
              <React.Fragment>
                <div className="divider"></div>
                <div className="dim up" style={{ fontSize: 10, marginBottom: 8 }}>{T("คำสำคัญที่ตรวจพบ", "Detected entities")}</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {digest.entities.map(e => (
                    <span key={e} className="tag">{e}</span>
                  ))}
                </div>
              </React.Fragment>
            )}
          </Panel>

          <Panel title={T("แนวโน้มหัวข้อ (6 ชม.)", "Trending Topics (6h)")} icon="feed">
            {!trend6h.length && (
              <div className="empty">{T("ไม่มีข่าวเข้าฟีดใน 6 ชั่วโมงที่ผ่านมา", "Nothing reached the feed in the past 6 hours")}</div>
            )}
            {trend6h.map((r, i) => (
              <div className="srcbar" key={i}>
                <div className="nm" style={{ width: 120 }}>{r.t}</div>
                <div className="track">
                  <div className="fill" style={{ width: (r.n / trend6h[0].n * 100) + "%", background: r.c }}></div>
                </div>
                <div className="ct">{r.n}</div>
              </div>
            ))}
          </Panel>

          <Panel title={T("คุณภาพข่าวกรอง", "Feed Quality")} icon="shield">
            <div className="row" style={{ gap: 14, alignItems: "center" }}>
              <Gauge value={quality.pct} size={84} label={T("เชื่อถือได้", "VERIFIED")} color="var(--ok)" />
              <div className="col" style={{ gap: 6, fontSize: "var(--fs-sm)", flex: 1 }}>
                <div className="row between"><span className="dim">{T("ยืนยัน/สอดคล้อง", "Corroborated")}</span><span className="mono">{quality.ok}</span></div>
                <div className="row between"><span className="dim">{T("รอตรวจสอบ", "Pending")}</span><span className="mono" style={{ color: "var(--accent)" }}>{quality.pending}</span></div>
                <div className="row between"><span className="dim">{T("บริบท", "Context")}</span><span className="mono">{quality.context}</span></div>
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
