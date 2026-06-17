/* ============================================================
   Screen: News Detail — AI deep summary + credibility ratings
   เปิดเมื่อคลิกข่าวในฟีด OSINT
   ============================================================ */
const ADM_REL = {
  A: ["เชื่อถือได้สมบูรณ์", "Completely reliable"],
  B: ["เชื่อถือได้เป็นส่วนใหญ่", "Usually reliable"],
  C: ["เชื่อถือได้พอสมควร", "Fairly reliable"],
  D: ["มักเชื่อถือไม่ได้", "Not usually reliable"],
  E: ["เชื่อถือไม่ได้", "Unreliable"],
  F: ["ประเมินไม่ได้", "Cannot be judged"],
};
const ADM_CRED = {
  "1": ["ยืนยันแล้ว", "Confirmed"],
  "2": ["น่าจะจริง", "Probably true"],
  "3": ["อาจเป็นจริง", "Possibly true"],
  "4": ["น่าสงสัย", "Doubtful"],
  "5": ["ไม่น่าเป็นจริง", "Improbable"],
};
const REL_SCORE  = { A: 95, B: 80, C: 65, D: 45, E: 25, F: 40 };
const CRED_SCORE = { "1": 95, "2": 80, "3": 62, "4": 42, "5": 22 };

function NewsDetail({ item, lang, onNav, showToast }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const n = item;

  const [aiState, setAiState] = React.useState("idle"); // idle|loading|done|error
  const [aiText, setAiText]   = React.useState("");
  const [aiEngine, setAiEngine] = React.useState("");

  if (!n) {
    return (
      <div className="screen">
        <div className="page-head">
          <div>
            <div className="eyebrow">{T("รายละเอียดข่าว", "News Detail")}</div>
            <div className="page-title">{T("ไม่พบข่าว", "Item not found")}</div>
          </div>
        </div>
        <div className="empty" style={{ marginTop: 40 }}>
          <a className="panel-link" onClick={() => onNav("osint")}>{T("กลับไปฟีดข่าว", "Back to feed")}</a>
        </div>
      </div>
    );
  }

  const src   = window.MDA_DATA.sources[n.srcKey];
  const vd    = (window.VERDICT && (window.VERDICT[n.verdict] || window.VERDICT.context)) || { kind: "mute", th: "บริบท", en: "CONTEXT" };
  const rel   = String(n.reliability || "C").toUpperCase().slice(0, 1);
  const cred  = String(n.credibility || "3").slice(0, 1);
  const relx  = ADM_REL[rel]  || ADM_REL.C;
  const crex  = ADM_CRED[cred] || ADM_CRED["3"];
  const score = Math.round(((REL_SCORE[rel] || 60) + (CRED_SCORE[cred] || 60)) / 2);

  const domMeta = window.MDA_THREAT_DOMAINS || [];
  const domains = (window.classifyThreats ? window.classifyThreats(n) : [])
    .map(k => domMeta.find(d => d.key === k)).filter(Boolean);
  const geo = window.geocodeText
    ? window.geocodeText(n.raw && n.raw.en, n.raw && n.raw.th, n.ai && n.ai.en, n.ai && n.ai.th, n.outlet)
    : null;

  const timeStr = n.isLive
    ? new Date(n.time).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : (n.time || "");

  const runAI = async () => {
    setAiState("loading"); setAiText("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       (n.raw && (n.raw.en || n.raw.th)) || "",
          summary:     (n.ai && (n.ai.en || n.ai.th)) || "",
          outlet:      n.outlet || (src && src.name) || n.srcKey,
          region:      geo ? (lang === "th" ? geo.th : geo.en) : "",
          reliability: rel, credibility: cred, verdict: n.verdict,
          threats:     domains.map(d => (lang === "th" ? d.th : d.en)),
          lang,
        }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined,
      });
      const j = await res.json();
      if (j && j.text) { setAiText(j.text); setAiEngine(j.engine || ""); setAiState("done"); }
      else setAiState("error");
    } catch (e) { setAiState("error"); }
  };

  return (
    <div className="screen">
      {/* breadcrumb */}
      <div className="row" style={{ gap: 10, marginBottom: 12, cursor: "pointer",
        color: "var(--text-dim)", fontSize: "var(--fs-sm)" }} onClick={() => onNav("osint")}>
        <Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />
        {T("กลับไปฟีดข่าวกรอง", "Back to intelligence feed")}
      </div>

      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 9, marginBottom: 6, flexWrap: "wrap" }}>
            {src
              ? <SrcChip srcKey={n.srcKey} withName lang={lang} />
              : <span className="tag">{n.outlet || n.srcKey}</span>}
            {n.isLive && <span className="tag" style={{ color: "var(--ok)", border: "1px solid rgba(70,201,118,0.35)" }}>LIVE</span>}
            <span className="tag mono" title="Admiralty reliability/credibility">{rel}{cred}</span>
            <Badge kind={vd.kind} dot>{T(vd.th, vd.en)}</Badge>
            {domains.map(d => (
              <span key={d.key} className="tag" style={{ color: d.color, background: d.color + "1e", border: "1px solid " + d.color + "55" }}>
                {T(d.th, d.en)}
              </span>
            ))}
          </div>
          <div className="page-title" style={{ maxWidth: 820 }}>{tx(n.raw, lang)}</div>
          <div className="page-sub row" style={{ gap: 14, flexWrap: "wrap" }}>
            <span className="row" style={{ gap: 5 }}><Icon name="clock" size={13} />{timeStr}</span>
            {n.outlet && <span className="row" style={{ gap: 5 }}><Icon name="globe" size={13} />{n.outlet}</span>}
            {geo && <span className="row" style={{ gap: 5 }}><Icon name="pin" size={13} />{lang === "th" ? geo.th : geo.en}</span>}
          </div>
        </div>
        <div className="row">
          {geo && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("map", {
              focus: { lat: geo.lat, lon: geo.lon, label: lang === "th" ? geo.th : geo.en, title: tx(n.raw, lang) } })}>
              <Icon name="pin" size={14} />{T("ดูบนแผนที่", "View on map")}
            </button>
          )}
          {n.url && n.url !== "#" && (
            <a className="btn btn-ghost btn-sm" href={n.url} target="_blank" rel="noopener noreferrer">
              <Icon name="link" size={14} />{T("ต้นฉบับ", "Original")}
            </a>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>
        {/* LEFT — AI */}
        <div className="col" style={{ gap: 12 }}>
          <Panel title={T("สรุปข่าว (AI)", "AI Summary")} icon="spark"
            action={<span className="ai-chip"><Icon name="cpu" size={12} />auto</span>}>
            <div className="nsum" style={{ color: "var(--text)", fontSize: "var(--fs-base)", lineHeight: 1.7 }}>
              {tx(n.ai, lang) || T("ไม่มีสรุปย่อ", "No summary available")}
            </div>
          </Panel>

          <Panel title={T("บทวิเคราะห์เชิงลึก (AI)", "Deep AI Assessment")} icon="cpu"
            action={<span className="ai-chip"><Icon name="spark" size={12} />{aiEngine === "claude" ? "Claude" : aiEngine === "offline" ? "offline" : "Thai-MECC"}</span>}>
            {aiState === "idle" && (
              <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={runAI}>
                <Icon name="spark" size={14} />{T("วิเคราะห์เชิงลึกด้วย AI", "Run deep AI analysis")}
              </button>
            )}
            {aiState === "loading" && (
              <div className="dim" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                <span className="flash"></span> {T("กำลังวิเคราะห์…", "Analyzing…")}
              </div>
            )}
            {aiState === "error" && (
              <div className="col" style={{ gap: 8 }}>
                <div style={{ color: "var(--crit)", fontSize: "var(--fs-sm)" }}>⚠ {T("วิเคราะห์ไม่สำเร็จ", "Analysis failed")}</div>
                <button className="btn btn-ghost btn-sm" onClick={runAI}>{T("ลองใหม่", "Retry")}</button>
              </div>
            )}
            {aiState === "done" && (
              <div className="nsum" style={{ color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiText}</div>
            )}
          </Panel>
        </div>

        {/* RIGHT — credibility + meta */}
        <div className="col" style={{ gap: 12 }}>
          <Panel title={T("ความน่าเชื่อถือ", "Source Credibility")} icon="shield">
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              <Gauge value={score} label={T("คะแนน", "SCORE")}
                color={score >= 75 ? "var(--ok)" : score >= 50 ? "var(--accent)" : "var(--crit)"} />
              <div className="col" style={{ gap: 8, flex: 1 }}>
                <Badge kind={vd.kind} dot>{T(vd.th, vd.en)}</Badge>
                <div className="kv" style={{ gridTemplateColumns: "auto 1fr" }}>
                  <span className="k mono">{rel}</span><span className="v" style={{ fontSize: "var(--fs-sm)" }}>{T(relx[0], relx[1])}</span>
                  <span className="k mono">{cred}</span><span className="v" style={{ fontSize: "var(--fs-sm)" }}>{T(crex[0], crex[1])}</span>
                </div>
              </div>
            </div>
            <div className="divider"></div>
            <div className="kv" style={{ gridTemplateColumns: "auto 1fr", textAlign: "left" }}>
              <span className="k mono">A–F</span><span className="dim" style={{ fontSize: "var(--fs-xs)" }}>{T("ความน่าเชื่อถือของแหล่ง", "Source reliability")}</span>
              <span className="k mono">1–5</span><span className="dim" style={{ fontSize: "var(--fs-xs)" }}>{T("ความน่าเชื่อของข้อมูล", "Information credibility")}</span>
            </div>
          </Panel>

          <Panel title={T("ข้อมูลข่าว", "Report Metadata")} icon="feed">
            <div className="kv">
              <span className="k">{T("แหล่งข่าว", "Outlet")}</span>
              <span className="v">{n.outlet || (src && src.name) || n.srcKey}</span>
              <span className="k">{T("เวลา", "Time")}</span>
              <span className="v">{timeStr}</span>
              {geo && <span className="k">{T("พื้นที่", "Area")}</span>}
              {geo && <span className="v">{lang === "th" ? geo.th : geo.en}</span>}
              <span className="k">{T("สถานะ", "Status")}</span>
              <span className="v">{n.isLive ? T("ข่าวสด", "Live") : T("คลัง", "Archive")}</span>
            </div>
            {n.linkedInc && (
              <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 10 }}
                onClick={() => onNav("incident", { id: n.linkedInc })}>
                <Icon name="link" size={13} />{T("ดูเหตุการณ์ที่เชื่อมโยง", "Open linked incident")} {n.linkedInc}
              </button>
            )}
          </Panel>

          {domains.length > 0 && (
            <Panel title={T("ภัยคุกคามที่เกี่ยวข้อง (ศรชล.)", "Related Threat Domains")} icon="shield">
              <div className="row wrap" style={{ gap: 6 }}>
                {domains.map(d => (
                  <span key={d.key} className="tag" style={{ color: d.color, background: d.color + "1e", border: "1px solid " + d.color + "55" }}>
                    {T(d.th, d.en)}
                  </span>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewsDetail });
