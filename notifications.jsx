/* ============================================================
   Notification / Alert Center — real alerts from the news feed
   แจ้งเตือนเฉพาะเมื่อมี "ข่าว/เหตุการณ์ใหม่" เข้าฟีด (ติดตามด้วย id ที่เคยเห็น)
   ============================================================ */
const NOTIF_SEEN_KEY = "MDA_NOTIF_SEEN_IDS";

function _loadSeen() {
  try { return JSON.parse(localStorage.getItem(NOTIF_SEEN_KEY) || "null"); }
  catch { return null; }
}
function _saveSeen(ids) {
  try { localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(ids.slice(0, 300))); } catch {}
}

function notifSev(n) {
  const ks = window.classifyThreats ? window.classifyThreats(n) : [];
  if (ks.some(k => ["TERROR", "PIRACY", "WMD"].includes(k))) return "critical";
  if (ks.some(k => ["DRUG", "HUMAN", "DISASTER", "SAR"].includes(k))) return "high";
  if (ks.length) return "medium";
  return "info";
}

/* hook: แปลงฟีดข่าวเป็นการแจ้งเตือน + นับที่ยังไม่อ่าน */
function useNotifications(news) {
  // seen === null แปลว่ายังไม่เคยตั้งค่า (ครั้งแรก) → จะ seed ด้วยข่าวปัจจุบันทั้งหมด
  const [seen, setSeen] = React.useState(_loadSeen);

  const sorted = React.useMemo(
    () => (news || []).slice().sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 40),
    [news]
  );

  // ครั้งแรกสุด: ทำให้ข่าวที่มีอยู่แล้ว "อ่านแล้ว" จะได้ไม่เด้งเตือนย้อนหลัง
  React.useEffect(() => {
    if (seen === null && sorted.length) {
      const ids = sorted.map(n => n.id);
      setSeen(ids); _saveSeen(ids);
    }
  }, [seen, sorted]);

  const seenSet = React.useMemo(() => new Set(seen || []), [seen]);
  const notifications = sorted.map(n => ({ n, sev: notifSev(n), unread: seen !== null && !seenSet.has(n.id) }));
  const unread = seen === null ? 0 : notifications.filter(x => x.unread).length;

  const markAllSeen = React.useCallback(() => {
    const ids = sorted.map(n => n.id);
    setSeen(ids); _saveSeen(ids);
  }, [sorted]);

  return { notifications, unread, markAllSeen };
}

function NotifPanel({ open, onClose, lang, onNav, items }) {
  const T = (th, en) => (lang === "th" ? th : en);
  if (!open) return null;

  const list = items || [];
  const sevColor = (sev) =>
    sev === "critical" ? "var(--crit)" :
    sev === "high"     ? "var(--accent)" :
    sev === "medium"   ? "var(--info)" : "var(--text-mute)";

  const timeOf = (n) => n.isLive
    ? window.mdaTimeAgo(n.time, lang)
    : (typeof n.ago === "object" ? tx(n.ago, lang) : (n.time || ""));

  return (
    <div style={{
      position: "fixed", right: 0, top: 52, bottom: 0, width: 340,
      background: "var(--surface)", borderLeft: "1px solid var(--border)",
      zIndex: 50, display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="bell" size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontWeight: 600, flex: 1 }}>{T("ศูนย์แจ้งเตือน", "Alert Center")}</span>
        <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>{T("ข่าวเข้าฟีด", "Feed alerts")}</span>
        <div className="icon-btn" style={{ width: 26, height: 26 }} onClick={onClose}>
          <Icon name="minus" size={14} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">{T("ยังไม่มีการแจ้งเตือน", "No notifications yet")}</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {list.map(({ n, sev, unread }) => (
            <div key={n.id} style={{
              padding: "11px 14px", borderBottom: "1px solid var(--border)",
              display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
              background: unread ? "rgba(var(--accent-rgb),0.06)" : "",
            }}
              onClick={() => { onNav("newsDetail", { item: n }); onClose(); }}
              onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={ev => ev.currentTarget.style.background = unread ? "rgba(var(--accent-rgb),0.06)" : ""}>
              <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: sevColor(sev), flex: "none" }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                  {window.MDA_DATA.sources[n.srcKey]
                    ? <SrcChip srcKey={n.srcKey} withName lang={lang} />
                    : <span className="tag" style={{ fontSize: 9 }}>{n.outlet || n.srcKey}</span>}
                  {unread && <span className="tag" style={{ fontSize: 9, color: "var(--accent)", border: "1px solid rgba(var(--accent-rgb),0.4)" }}>{T("ใหม่", "NEW")}</span>}
                  <span className="topbar-spacer"></span>
                  <span className="mute mono" style={{ fontSize: "var(--fs-xs)" }}>{timeOf(n)}</span>
                </div>
                <div style={{ fontSize: "var(--fs-sm)", lineHeight: 1.45 }}>{tx(n.raw, lang)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
          onClick={() => { onNav("osint"); onClose(); }}>
          <Icon name="feed" size={13} />{T("เปิดฟีดข่าวทั้งหมด", "Open full feed")}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { NotifPanel, useNotifications });
