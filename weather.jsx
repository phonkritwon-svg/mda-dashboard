/* ============================================================
   สภาพทะเล — ดึงจาก Open-Meteo Marine (ฟรี ไม่ต้องใช้ API key)

   ทำไมเรียกจากเบราว์เซอร์ตรง ๆ ไม่ผ่านเซิร์ฟเวอร์:
     Open-Meteo ส่ง access-control-allow-origin: * และเป็น REST ธรรมดา
     จึงไม่ต้องมี serverless function และทำงานเหมือนกันทั้งบนเครื่องและ
     บน Vercel — ต่างจาก AIS ที่ต้องถือ WebSocket ค้างจนขึ้น production ไม่ได้

   ข้อจำกัดที่ยอมรับไว้: ไม่มีความเร็วลม
     ความเร็วลมอยู่ที่ api.open-meteo.com คนละโดเมนกับ marine-api
     ซึ่งเครือข่ายที่ทดสอบแปลง DNS ไม่ผ่าน จึงไม่ดึงมา และ "ไม่เดาแทน"
     คลื่นลม (wind wave) ที่แสดงคือคลื่นที่เกิดจากลมในพื้นที่จริง ๆ
     ใช้อนุมานสภาพลมได้คร่าว ๆ แต่ไม่ใช่ค่าลมที่วัดมา จึงไม่เรียกว่าลม
   ============================================================ */

const MARINE_AREAS = [
  { key: "gulf",    lat: 9.5,  lon: 101.5, th: "อ่าวไทย",        en: "Gulf of Thailand" },
  { key: "andaman", lat: 8.0,  lon: 97.0,  th: "อันดามัน",       en: "Andaman Sea" },
  { key: "scs",     lat: 15.0, lon: 117.0, th: "ทะเลจีนใต้",     en: "South China Sea" },
  { key: "malacca", lat: 2.5,  lon: 101.0, th: "ช่องแคบมะละกา", en: "Strait of Malacca" },
];

const MARINE_FIELDS = [
  "wave_height", "wave_period", "wave_direction",
  "wind_wave_height", "swell_wave_height",
  "sea_surface_temperature", "ocean_current_velocity", "ocean_current_direction",
].join(",");

const MARINE_URL =
  "https://marine-api.open-meteo.com/v1/marine" +
  "?latitude="  + MARINE_AREAS.map(a => a.lat).join(",") +
  "&longitude=" + MARINE_AREAS.map(a => a.lon).join(",") +
  "&current="   + MARINE_FIELDS +
  "&timezone=Asia%2FBangkok";

const MARINE_POLL_MS  = 15 * 60 * 1000;  // แบบจำลองอัปเดตทุก 15 นาที ถี่กว่านี้ไม่ได้ค่าใหม่
const MARINE_RETRY_MS = 20 * 1000;       // ล้มเหลวแล้วลองใหม่เร็ว ๆ ก่อน
const MARINE_MAX_RETRY = 4;

/* มาตราคลื่นดักลาส (WMO) — เกณฑ์สากล ไม่ใช่ตัวเลขที่ตั้งเอง
   ผูกกับ "ความหมายต่อการปฏิบัติ" เพราะตัวเลขความสูงคลื่นลอย ๆ
   ไม่ได้บอกว่าออกเรือได้หรือไม่ได้ */
const SEA_STATES = [
  { max: 0.10, code: 1, th: "เรียบ",          en: "Calm",       color: "#46c976",
    opTh: "ทะเลเรียบมาก — เรือเล็กออกได้ทุกประเภท",
    opEn: "Glassy — every class of small craft can operate." },
  { max: 0.50, code: 2, th: "เรียบเล็กน้อย",  en: "Smooth",     color: "#46c976",
    opTh: "เอื้อต่อเรือเล็กมาก · ช่วงที่ลักลอบขนส่งและประมงผิดกฎหมายมักเลือก",
    opEn: "Highly favourable to small craft — the weather smuggling and IUU fishing prefer." },
  { max: 1.25, code: 3, th: "เล็กน้อย",       en: "Slight",     color: "#8fd14f",
    opTh: "ปฏิบัติการได้ตามปกติทุกขนาดเรือ",
    opEn: "Routine operations for all vessel sizes." },
  { max: 2.50, code: 4, th: "ปานกลาง",        en: "Moderate",   color: "#e3b341",
    opTh: "เรือประมงเล็กเริ่มลำบาก · การตรวจค้นกลางทะเลทำได้ยากขึ้น",
    opEn: "Small fishing boats begin to struggle; boarding becomes harder." },
  { max: 4.00, code: 5, th: "แรง",             en: "Rough",      color: "#f0884d",
    opTh: "เรือเล็กควรงดออก · SAR เสี่ยงขึ้นชัดเจน",
    opEn: "Small craft should stay in; SAR risk rises sharply." },
  { max: 6.00, code: 6, th: "แรงมาก",          en: "Very rough", color: "#f6553f",
    opTh: "จำกัดการปฏิบัติของเรือตรวจการณ์ · เฮลิคอปเตอร์อาจขึ้นบินไม่ได้",
    opEn: "Patrol operations limited; helicopter launch may be impossible." },
  { max: 999,  code: 7, th: "สูง",             en: "High",       color: "#f6553f",
    opTh: "สภาพอันตราย — ปฏิบัติการทางทะเลแทบเป็นไปไม่ได้",
    opEn: "Dangerous — maritime operations near impossible." },
];

function seaState(waveHeight) {
  const h = typeof waveHeight === "number" ? waveHeight : 0;
  return SEA_STATES.find(s => h <= s.max) || SEA_STATES[SEA_STATES.length - 1];
}

/* ทิศเป็นองศา → ชื่อทิศ 8 ทาง (อ่านเร็วกว่าตัวเลของศา)
   ใช้คำเต็มในภาษาไทยเพราะไม่มีตัวย่อทิศที่เป็นมาตรฐาน — ย่อเองแล้วอ่านไม่ออก
   ข้อความนี้อยู่ในทูลทิปซึ่งมีที่พอ ไม่ต้องประหยัดตัวอักษร */
const COMPASS_TH = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้",
                    "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
const COMPASS_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(deg, th) {
  if (typeof deg !== "number") return "";
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return th ? COMPASS_TH[i] : COMPASS_EN[i];
}

const KMH_TO_KN = 0.539957;

function useMarineWeather() {
  const [state, setState] = React.useState({
    areas: [], at: null, error: null, loading: true,
  });

  /* ตั้งรอบถัดไปหลังรู้ผลรอบนี้ ไม่ใช่ setInterval คงที่ — ด้วยเหตุผล 2 ข้อ
     1) พลาดครั้งเดียวตอนโหลดหน้าไม่ควรทำให้แผงตายยาว 15 นาที จึงรีบลองใหม่ก่อน
     2) คำขอไม่ซ้อนกันถ้าเครือข่ายช้ากว่ารอบ                                */
  React.useEffect(() => {
    let alive = true, timer = null, fails = 0;

    const schedule = (ms) => { if (alive) timer = setTimeout(pull, ms); };

    async function pull() {
      try {
        const res = await fetch(MARINE_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const body = await res.json();
        // ขอหลายพิกัด → ได้อาเรย์ · ขอพิกัดเดียว → ได้ออบเจ็กต์
        const rows = Array.isArray(body) ? body : [body];
        if (!alive) return;
        const areas = MARINE_AREAS.map((a, i) => {
          const c = (rows[i] && rows[i].current) || null;
          return c ? { ...a, ...c, ok: true } : { ...a, ok: false };
        });
        const stamp = rows[0] && rows[0].current && rows[0].current.time;
        fails = 0;
        setState({ areas, at: stamp || null, error: null, loading: false });
        schedule(MARINE_POLL_MS);
      } catch (e) {
        if (!alive) return;
        fails += 1;
        // ไม่แสดงค่าเก่าค้างไว้เป็นค่าปัจจุบัน — บอกตรง ๆ ว่าดึงไม่ได้
        setState(s => ({
          ...s,
          error: String(e.message || e),
          retrying: fails <= MARINE_MAX_RETRY,
          loading: false,
        }));
        schedule(fails <= MARINE_MAX_RETRY ? MARINE_RETRY_MS : MARINE_POLL_MS);
      }
    }

    pull();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  return state;
}

function MarineConditions({ lang }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const th = lang === "th";
  const { areas, at, error, loading, retrying } = useMarineWeather();

  const worst = areas.reduce((acc, a) => {
    if (!a.ok || typeof a.wave_height !== "number") return acc;
    return !acc || a.wave_height > acc.wave_height ? a : acc;
  }, null);

  return (
    <Panel title={T("สภาพทะเล", "Sea State")} icon="wave"
      action={worst ? (
        <span className="dim" style={{ fontSize: "var(--fs-xs)" }}>
          {T("คลื่นสูงสุด", "peak")} {worst.wave_height.toFixed(1)} {T("ม.", "m")}
        </span>
      ) : null}>

      {loading && (
        <div className="dim" style={{ fontSize: "var(--fs-sm)" }}>
          {T("กำลังดึงข้อมูล…", "Loading…")}
        </div>
      )}

      {error && !loading && (
        <div style={{ fontSize: "var(--fs-sm)", lineHeight: 1.6 }}>
          <span style={{ color: "var(--crit)" }}>
            {T("ดึงข้อมูลสภาพทะเลไม่ได้", "Could not fetch sea state")}
          </span>
          <div className="dim" style={{ fontSize: "var(--fs-xs)", marginTop: 3 }}>
            {error}{retrying ? T(" · กำลังลองใหม่…", " · retrying…") : ""}
          </div>
        </div>
      )}

      {!loading && !error && areas.map(a => {
        const ok = a.ok && typeof a.wave_height === "number";
        const s = ok ? seaState(a.wave_height) : null;
        const lines = ok ? [
          T("คลื่น ", "Waves ") + a.wave_height.toFixed(2) + T(" ม.", " m")
            + (typeof a.wave_period === "number" ? " · " + a.wave_period.toFixed(1) + T(" วิ", " s") : "")
            + (typeof a.wave_direction === "number" ? " · " + T("จาก", "from") + " " + compass(a.wave_direction, th) : ""),
          typeof a.swell_wave_height === "number"
            ? T("คลื่นใต้น้ำ ", "Swell ") + a.swell_wave_height.toFixed(2) + T(" ม.", " m") : "",
          typeof a.wind_wave_height === "number"
            ? T("คลื่นลม ", "Wind wave ") + a.wind_wave_height.toFixed(2) + T(" ม.", " m") : "",
          typeof a.ocean_current_velocity === "number"
            ? T("กระแสน้ำ ", "Current ") + (a.ocean_current_velocity * KMH_TO_KN).toFixed(1)
              + T(" นอต ", " kn ") + compass(a.ocean_current_direction, th) : "",
          typeof a.sea_surface_temperature === "number"
            ? T("ผิวน้ำ ", "SST ") + a.sea_surface_temperature.toFixed(1) + "°C" : "",
        ].filter(Boolean) : [];
        // ต่อคำอธิบายผลต่อการปฏิบัติหลังบรรทัดว่าง — ใส่หลัง filter ไม่งั้นบรรทัดว่างถูกกินไปด้วย
        const detail = ok
          ? lines.concat(["", s[th ? "opTh" : "opEn"]]).join("\n")
          : T("ไม่มีข้อมูลพื้นที่นี้", "No data for this area");

        return (
          <div key={a.key} title={detail} className="srcbar" style={{ cursor: "help" }}>
            <div className="nm" style={{ width: 96 }}>{T(a.th, a.en)}</div>
            <div className="track">
              {/* เทียบสเกลกับคลื่น 4 ม. = เต็มแถบ (เกินนั้นคือสภาพอันตรายอยู่แล้ว) */}
              <div className="fill" style={{
                width: ok ? Math.max(3, Math.min(100, a.wave_height / 4 * 100)) + "%" : "0%",
                background: s ? s.color : "var(--text-mute)",
              }} />
            </div>
            <div className="ct" style={{ color: s ? s.color : "var(--text-mute)", minWidth: 58, textAlign: "right" }}>
              {ok ? a.wave_height.toFixed(1) + T(" ม.", " m") : "—"}
            </div>
          </div>
        );
      })}

      {!loading && !error && worst && (
        <>
          <div className="divider" />
          <div className="dim" style={{ fontSize: "var(--fs-xs)", lineHeight: 1.6 }}>
            {seaState(worst.wave_height)[th ? "opTh" : "opEn"]}
          </div>
        </>
      )}

      {!loading && at && (
        <div className="dim" style={{ fontSize: "var(--fs-xs)", marginTop: 8 }}>
          {T("ข้อมูล ", "Data ")}{String(at).replace("T", " ")}
          {T(" น. · Open-Meteo Marine", " · Open-Meteo Marine")}
        </div>
      )}
    </Panel>
  );
}

Object.assign(window, { MarineConditions, useMarineWeather, MARINE_AREAS, seaState });
