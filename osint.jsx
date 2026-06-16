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
  const agoStr = n.isLive
    ? window.mdaTimeAgo(n.time, lang)
    : tx(n.ago, lang);
  return (
    <div className="feed-row news-row">
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
            onClick={() => onNav("incident", { id: n.linkedInc })}>
            <Icon name="link" size={11} />{n.linkedInc}
          </span>
        )}
        <span className="topbar-spacer"></span>
        <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>{agoStr}</span>
      </div>
      <div className="ntitle">{tx(n.raw, lang)}</div>
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
        <a className="panel-link" href={n.url} target="_blank" rel="noopener noreferrer"
          onClick={(ev) => ev.stopPropagation()}>
          {T("เปิดข่าวต้นฉบับ", "Open original")}<Icon name="link" size={12} />
        </a>
      </div>
    </div>
  );
}

function Osint({ data, lang, onNav }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const [filter, setFilter] = useState("all");

  const { news: allNews, liveCount, fetching, lastFetch, fetchError, doFetch } =
    window.useNewsUpdater(data.news);

  const news = allNews.filter(n =>
    filter === "all"    ? true :
    filter === "linked" ? n.linkedInc :
    filter === "live"   ? n.isLive :
    n.srcKey === filter
  );

  const srcCounts = {};
  allNews.forEach(n => { srcCounts[n.srcKey] = (srcCounts[n.srcKey] || 0) + 1; });

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
          <button className="btn btn-ghost btn-sm"><Icon name="filter" size={14} />{T("ตัวกรอง", "Filters")}</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "210px 1fr 330px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* left filter rail */}
        <div className="col" style={{ gap: 12, minHeight: 0, overflow: "auto" }}>
          <Panel title={T("แหล่งข่าว", "Sources")} icon="layers">
            <div className="col" style={{ gap: 3 }}>
              <div className={"pill-tab" + (filter === "all" ? " active" : "")}
                style={{ justifyContent: "space-between", display: "flex" }}
                onClick={() => setFilter("all")}>
                <span>{T("ทั้งหมด", "All sources")}</span>
                <span className="mono dim">{allNews.length}</span>
              </div>
              {liveCount > 0 && (
                <div className={"pill-tab" + (filter === "live" ? " active" : "")}
                  style={{ justifyContent: "space-between", display: "flex" }}
                  onClick={() => setFilter("live")}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }}></span>
                    {T("ข่าวสด", "Live feeds")}
                  </span>
                  <span className="mono dim">{liveCount}</span>
                </div>
              )}
              <div className={"pill-tab" + (filter === "linked" ? " active" : "")}
                style={{ justifyContent: "space-between", display: "flex" }}
                onClick={() => setFilter("linked")}>
                <span>{T("เชื่อมเหตุการณ์", "Linked to incident")}</span>
                <span className="mono dim">{allNews.filter(n => n.linkedInc).length}</span>
              </div>
              <div className="divider" style={{ margin: "6px 0" }}></div>
              {Object.entries(srcCounts).map(([k, c]) => (
                <div key={k} className={"pill-tab" + (filter === k ? " active" : "")}
                  style={{ justifyContent: "space-between", display: "flex" }}
                  onClick={() => setFilter(k)}>
                  <SrcChip srcKey={k} withName lang={lang} />
                  <span className="mono dim">{c}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={T("ตำนานความน่าเชื่อถือ", "Admiralty Code")} icon="shield">
            <div className="kv" style={{ gridTemplateColumns: "auto 1fr", textAlign: "left" }}>
              <span className="k mono">A–F</span><span style={{ fontSize: "var(--fs-xs)" }} className="dim">{T("ความน่าเชื่อถือแหล่ง", "Source reliability")}</span>
              <span className="k mono">1–5</span><span style={{ fontSize: "var(--fs-xs)" }} className="dim">{T("ความน่าเชื่อข้อมูล", "Info credibility")}</span>
            </div>
          </Panel>
        </div>

        {/* center feed */}
        <Panel flush title={T("สตรีมข่าวกรอง", "Intelligence Stream")} icon="feed"
          action={<span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>{news.length} {T("รายการ", "items")}</span>}
          style={{ minHeight: 0 }}>
          <div className="feed scroll-y" style={{ height: "100%" }}>
            {news.length
              ? news.map(n => <NewsRow key={n.id} n={n} lang={lang} onNav={onNav} />)
              : <div className="empty">{T("ไม่มีรายการในตัวกรองนี้", "No items for this filter")}</div>}
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
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Osint, NewsRow, VERDICT });
