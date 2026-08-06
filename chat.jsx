/* ============================================================
   Screen: Chat — ถาม-ตอบเกี่ยวกับข่าวทั้งหมดในระบบ
   ส่งข่าวที่มีอยู่ไปให้ /api/chat แล้วให้ตอบโดยอ้างอิงข่าวจริงเท่านั้น
   ============================================================ */

const CHAT_SUGGESTIONS = [
  { th: "สรุปสถานการณ์ทะเลแดงตอนนี้",        en: "Summarise the Red Sea situation now" },
  { th: "มีข่าวอะไรเกี่ยวกับอ่าวไทยบ้าง",      en: "What reporting is there on the Gulf of Thailand?" },
  { th: "ข่าวไหนเกี่ยวกับประมงผิดกฎหมาย",      en: "Which items involve IUU fishing?" },
  { th: "มีเหตุโจมตีเรือที่ไหนบ้าง",           en: "Where have vessels been attacked?" },
  { th: "ข่าวที่กระทบเส้นทางเดินเรือของไทย",    en: "Reporting affecting Thai shipping lanes" },
];

function ChatScreen({ data, lang, onNav, showToast }) {
  const T = (th, en) => (lang === "th" ? th : en);

  // ข่าวทั้งหมดในระบบ (ฟีดสด + ฐานข้อมูล)
  const { news: allNews } = window.useNewsUpdater(data.news);

  const [msgs, setMsgs]       = React.useState([]);   // {role:'user'|'assistant', content, sources?, engine?}
  const [input, setInput]     = React.useState("");
  const [busy, setBusy]       = React.useState(false);
  const scrollRef             = React.useRef(null);
  const inputRef              = React.useRef(null);

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ — แต่ถ้าผู้ใช้เลื่อนขึ้นไปอ่านคำตอบเก่าอยู่
  // จะไม่ดึงจอลงมา (กันไม่ให้อ่านค้างแล้วโดนกระชากลงล่าง)
  const pinnedRef = React.useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  // แปลงข่าวเป็นรูปแบบที่ฝั่งเซิร์ฟเวอร์ใช้ค้นและอ้างอิง
  const newsPayload = React.useMemo(() => (allNews || []).map(n => {
    const geo = window.geocodeText
      ? window.geocodeText(n.raw && n.raw.en, n.raw && n.raw.th,
          n.ai && n.ai.en, n.ai && n.ai.th, n.outlet)
      : null;
    return {
      id:      n.id,
      title:   (n.raw && (n.raw.th || n.raw.en)) || "",
      summary: (n.ai && (n.ai.th || n.ai.en)) || "",
      outlet:  n.outlet || n.srcKey || "",
      region:  geo ? (lang === "th" ? geo.th : geo.en) : "",
      time:    n.isLive && n.time
        ? new Date(n.time).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB",
            { day: "2-digit", month: "short" })
        : (n.time || ""),
      url:     n.url,
    };
  }), [allNews, lang]);

  const send = async (text) => {
    const q = (text != null ? text : input).trim();
    if (!q || busy) return;

    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, news: newsPayload, lang }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined,
      });
      const j = await res.json();
      setMsgs(m => [...m, {
        role: "assistant",
        content: (j && j.text) || T("ไม่ได้รับคำตอบ", "No answer returned"),
        sources: (j && j.sources) || [],
        engine: j && j.engine,
      }]);
    } catch (e) {
      setMsgs(m => [...m, {
        role: "assistant",
        engine: "error",
        content: T(
          "เชื่อมต่อผู้ช่วยไม่สำเร็จ — ตรวจว่าเซิร์ฟเวอร์รันด้วย server.py (ไม่ใช่ python -m http.server)",
          "Could not reach the assistant — make sure the server runs server.py, not python -m http.server"),
        sources: [],
      }]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const engineLabel = (() => {
    const last = [...msgs].reverse().find(m => m.role === "assistant" && m.engine);
    if (!last) return "AI";
    if (last.engine === "claude") return "Claude";
    if (last.engine === "offline") return T("โหมดค้นหา", "search mode");
    return "AI";
  })();

  // เปิดข่าวจากรายการอ้างอิง
  const openSource = (s) => {
    const item = (allNews || []).find(n => n.id === s.id);
    if (item) onNav("newsDetail", { item });
    else if (s.url && s.url !== "#") window.open(s.url, "_blank", "noopener");
  };

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", paddingBottom: 16 }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">NEWS Q&amp;A ASSISTANT</div>
          <div className="page-title">{T("ผู้ช่วยถาม-ตอบข่าวกรอง", "Intelligence Q&A Assistant")}</div>
          <div className="page-sub">
            {T("ถามได้ทุกเรื่องจากข่าวในระบบ · อ้างอิงเฉพาะข่าวจริง ไม่แต่งเพิ่ม",
               "Ask anything about the reporting in the system · answers cite real items only")}
          </div>
        </div>
        <div className="row">
          <span className="ai-chip"><Icon name="cpu" size={12} />{engineLabel}</span>
          <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>
            {newsPayload.length} {T("ข่าวในคลัง", "items indexed")}
          </span>
          {msgs.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])}>
              <Icon name="refresh" size={14} />{T("ล้างบทสนทนา", "Clear")}
            </button>
          )}
        </div>
      </div>

      {/* ใช้ .panel ตรง ๆ ไม่ผ่านคอมโพเนนต์ Panel เพราะ .panel-body เป็น display:block
          ทำให้ flex:1 ของกล่องข้อความไม่มีผล กล่องจะยืดเต็มเนื้อหาแล้วถูก .panel ตัดทิ้งโดยเลื่อนไม่ได้ */}
      <div className="panel" style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        padding: 0, overflow: "hidden",
      }}>
        {/* ประวัติการสนทนา — ส่วนนี้เท่านั้นที่เลื่อนได้ */}
        <div ref={scrollRef} onScroll={onScroll} style={{
          flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
          padding: "14px 16px", overscrollBehavior: "contain",
        }}>
          {!msgs.length && (
            <div className="col" style={{ gap: 14, alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Icon name="spark" size={30} style={{ color: "var(--accent)", opacity: 0.7 }} />
              <div className="dim" style={{ textAlign: "center", lineHeight: 1.7, maxWidth: 460 }}>
                {T("ถามเกี่ยวกับข่าวทั้งหมดในระบบได้เลย เช่น พื้นที่ที่สนใจ ประเภทภัยคุกคาม หรือชื่อเรือ",
                   "Ask about any reporting in the system — an area, a threat type, or a vessel name.")}
              </div>
              <div className="row wrap" style={{ gap: 8, justifyContent: "center", maxWidth: 620 }}>
                {CHAT_SUGGESTIONS.map((s, i) => (
                  <span key={i} className="pill-tab" style={{ cursor: "pointer" }}
                    onClick={() => send(T(s.th, s.en))}>
                    {T(s.th, s.en)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="col" style={{ gap: 14 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: m.role === "user" ? "78%" : "92%",
              }}>
                <div style={{
                  padding: "10px 13px",
                  borderRadius: 11,
                  background: m.role === "user" ? "rgba(var(--accent-rgb),0.14)" : "var(--surface-2)",
                  border: "1px solid " + (m.role === "user"
                    ? "rgba(var(--accent-rgb),0.30)"
                    : (m.engine === "error" ? "rgba(var(--crit-rgb),0.4)" : "var(--border-2)")),
                  color: m.engine === "error" ? "var(--crit)" : "var(--text)",
                  fontSize: "var(--fs-sm)", lineHeight: 1.7, whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>

                {/* ข่าวที่ใช้อ้างอิง — คลิกเปิดข่าวจริงเพื่อตรวจสอบได้ */}
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div style={{ marginTop: 7 }}>
                    <div className="dim up" style={{ fontSize: 9, letterSpacing: "0.06em", marginBottom: 5 }}>
                      {T("อ้างอิงจากข่าว", "Cited reporting")}
                    </div>
                    <div className="col" style={{ gap: 4 }}>
                      {m.sources.slice(0, 6).map((s, k) => (
                        <div key={k} className="row" style={{ gap: 7, cursor: "pointer", alignItems: "flex-start" }}
                          onClick={() => openSource(s)}>
                          <span className="mono dim" style={{ fontSize: 10, flex: "none", marginTop: 2 }}>[{k + 1}]</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "var(--fs-xs)", lineHeight: 1.5, color: "var(--info)" }}>
                              {s.title}
                            </div>
                            <div className="dim" style={{ fontSize: 10 }}>
                              {s.outlet}{s.region ? " · " + s.region : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="dim row" style={{ gap: 8, alignItems: "center", alignSelf: "flex-start" }}>
                <span className="flash"></span>{T("กำลังค้นข่าวและเรียบเรียงคำตอบ…", "Searching reporting and composing an answer…")}
              </div>
            )}
          </div>
        </div>

        {/* ช่องพิมพ์ — ตรึงอยู่ล่างสุด ไม่เลื่อนไปกับบทสนทนา */}
        <div style={{ borderTop: "1px solid var(--border)", padding: 12, flex: "none" }}>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={T("พิมพ์คำถามเกี่ยวกับข่าว… (Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่)",
                             "Ask about the reporting… (Enter to send · Shift+Enter for a new line)")}
              style={{
                flex: 1, resize: "none",
                background: "var(--surface)", border: "1px solid var(--border-2)",
                borderRadius: 9, padding: "9px 11px", color: "var(--text)",
                fontSize: "var(--fs-sm)", fontFamily: "var(--font-ui)",
                outline: "none", lineHeight: 1.6,
              }} />
            <button className="btn btn-primary btn-sm" disabled={busy || !input.trim()}
              style={{ height: 38, opacity: (busy || !input.trim()) ? 0.5 : 1 }}
              onClick={() => send()}>
              <Icon name="spark" size={14} />{T("ถาม", "Ask")}
            </button>
          </div>
          <div className="dim" style={{ fontSize: 10, marginTop: 6 }}>
            {T("ผู้ช่วยตอบจากข่าวในระบบเท่านั้น หากไม่มีข้อมูลจะแจ้งตรง ๆ — ควรตรวจสอบกับข่าวต้นฉบับก่อนใช้ตัดสินใจ",
               "The assistant answers only from indexed reporting and will say when it cannot — verify against the original source before acting.")}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChatScreen });
