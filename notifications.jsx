/* ============================================================
   Notification / Alert Center — sliding panel
   ============================================================ */
function NotifPanel({ open, onClose, lang, onNav }) {
  const T = (th, en) => lang === "th" ? th : en;
  const [dismissed, setDismissed] = React.useState([]);

  const alerts = [
    { id: "A1", sev: "critical", time: "10:16", inc: "INC-3041",
      th: "INC-3041 · ฮูตีส่งสัญญาณรื้อฟื้นการโจมตีในทะเลแดง",
      en: "INC-3041 · Houthis signal renewed Red Sea attacks" },
    { id: "A2", sev: "critical", time: "09:30", inc: "INC-3038",
      th: "INC-3038 · เรือ Devon Bay อับปางใกล้สการ์โบโรห์ มีผู้เสียชีวิต",
      en: "INC-3038 · Devon Bay capsized near Scarborough, fatalities" },
    { id: "A3", sev: "high", time: "07:15", inc: "INC-3026",
      th: "INC-3026 · UKMTO เตือนเรือถูกโจมตีเหนือฟูไจราห์",
      en: "INC-3026 · UKMTO: tanker struck north of Fujairah" },
    { id: "A4", sev: "high", time: "06:10", inc: "INC-3035",
      th: "INC-3035 · ยูเครนโจมตีกองเรือเงาในทะเลดำ",
      en: "INC-3035 · Ukraine strikes shadow-fleet tankers, Black Sea" },
    { id: "A5", sev: "medium", time: "05:40", inc: "INC-3014",
      th: "INC-3014 · ตรวจพบกิจกรรมต้องสงสัยในอ่าวเอเดน",
      en: "INC-3014 · Suspicious approach in Gulf of Aden" },
  ];

  const visible = alerts.filter(a => !dismissed.includes(a.id));

  if (!open) return null;

  const sevColor = (sev) => sev === "critical" ? "var(--crit)" : sev === "high" ? "var(--accent)" : "var(--info)";

  return (
    <div style={{
      position: "fixed", right: 0, top: 52, bottom: 0, width: 340,
      background: "var(--surface)", borderLeft: "1px solid var(--border)",
      zIndex: 50, display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
    }}>
      {/* header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="bell" size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontWeight: 600, flex: 1 }}>{T("ศูนย์แจ้งเตือน", "Alert Center")}</span>
        {visible.length > 0 && <span className="badge badge-crit">{visible.length}</span>}
        <div className="icon-btn" style={{ width: 26, height: 26 }} onClick={onClose}>
          <Icon name="minus" size={14} />
        </div>
      </div>

      {/* alert list */}
      {visible.length === 0 ? (
        <div className="empty">{T("ไม่มีการแจ้งเตือนใหม่", "No new alerts")}</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {visible.map(a => (
            <div key={a.id} style={{
              padding: "11px 14px", borderBottom: "1px solid var(--border)",
              display: "flex", gap: 10, alignItems: "flex-start",
              transition: "background .12s", cursor: "pointer",
            }}
              onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={ev => ev.currentTarget.style.background = ""}>
              <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3,
                background: sevColor(a.sev), flex: "none" }}></div>
              <div style={{ flex: 1 }} onClick={() => { onNav("incident", { id: a.inc }); onClose(); }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)",
                  color: "var(--text-mute)", marginBottom: 3 }}>{a.time} ICT</div>
                <div style={{ fontSize: "var(--fs-sm)", lineHeight: 1.45 }}>{T(a.th, a.en)}</div>
                <div style={{ marginTop: 6 }}><SevBadge sev={a.sev} lang={lang} /></div>
              </div>
              <div className="icon-btn" style={{ width: 22, height: 22, flex: "none", marginTop: 2 }}
                title={T("ปิดการแจ้งเตือน", "Dismiss")}
                onClick={ev => { ev.stopPropagation(); setDismissed(d => [...d, a.id]); }}>
                <Icon name="minus" size={12} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
          onClick={() => setDismissed(alerts.map(a => a.id))}>
          <Icon name="check" size={13} />{T("ล้างทั้งหมด", "Clear all alerts")}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { NotifPanel });
