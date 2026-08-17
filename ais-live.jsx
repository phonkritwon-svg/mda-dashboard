/* ============================================================
   AIS สด (REST) — Digitraffic / กรมการขนส่งทางน้ำฟินแลนด์

   ทำไมต้องมีตัวนี้ทั้งที่มี ais.py อยู่แล้ว:
     ais.py ต่อ AISStream ด้วย WebSocket ซึ่งขึ้น Vercel ไม่ได้
     (serverless ถือ connection ค้างไม่ได้) และตอนนี้ AISStream
     ยังตัดการเชื่อมต่อโดยไม่บอกเหตุผล ใช้งานจริงไม่ได้

     Digitraffic เป็น REST ธรรมดา + เปิด CORS (allow-origin: *)
     หน้าเว็บจึงเรียกตรงได้ ไม่ต้องมี serverless และทำงานเหมือนกัน
     ทั้งบนเครื่องและบน production

   ⚠️ ข้อจำกัดที่ต้องบอกผู้ใช้ให้ชัด:
     ครอบคลุม "น่านน้ำฟินแลนด์" เท่านั้น ไม่ใช่อ่าวไทย/อันดามัน
     ใช้เพื่อพิสูจน์ว่าท่อ AIS ทั้งเส้นทำงาน และเพื่อให้เห็นเรือ
     ที่เคลื่อนที่จริง ระหว่างรอแหล่งที่ครอบคลุมน่านน้ำไทย
     ห้ามนำเสนอว่าเป็นภาพเรือในพื้นที่รับผิดชอบของ ศรชล.
   ============================================================ */

const DT_BASE = "https://meri.digitraffic.fi/api/ais/v1";
// Digitraffic ขอให้ระบุตัวตนผู้เรียก (นโยบายเขา) — อยู่ใน allow-headers แล้ว
const DT_HEADERS = { "Digitraffic-User": "MDA-Dashboard/1.0" };

const DT_POLL_MS     = 30 * 1000;        // ตำแหน่งเปลี่ยนตลอด แต่ 30 วิพอเห็นการเคลื่อนที่
const DT_META_MAX_MS = 30 * 60 * 1000;   // ชื่อ/ประเภทเรือเปลี่ยนช้า ดึงซ้ำทุกครึ่งชั่วโมงพอ
const DT_RETRY_MS    = 15 * 1000;

/* แปลงรหัสประเภทเรือ AIS → หมวดที่แผนที่ใช้
   ตรรกะเดียวกับ ship_type_to_kind ใน ais.py — ต้องตรงกัน ไม่งั้นเรือ
   ลำเดียวกันจะเปลี่ยนสีเมื่อสลับแหล่งข้อมูล
   ไม่รู้ประเภท = "unknown" ไม่ใช่ "dark" (dark แปลว่าจงใจดับสัญญาณ) */
function dtShipKind(t) {
  const n = parseInt(t, 10);
  if (!isFinite(n)) return "unknown";
  if (n === 30) return "fishing";
  if (n === 31 || n === 32 || n === 52) return "tug";
  if (n === 35 || n === 51 || n === 55) return "navy";
  if ((n >= 40 && n <= 49) || (n >= 60 && n <= 69)) return "passenger";
  if (n >= 70 && n <= 79) return "cargo";
  if (n >= 80 && n <= 89) return "tanker";
  if ((n >= 20 && n <= 29) || (n >= 90 && n <= 99)
      || [33, 34, 36, 37, 50, 53, 54, 56, 57, 58, 59].indexOf(n) >= 0) return "other";
  return "unknown";
}

async function dtFetch(path) {
  // ห้ามตั้ง Accept-Encoding เอง — เป็น forbidden header ใน fetch
  // เบราว์เซอร์ส่ง gzip ให้อยู่แล้ว ซึ่ง Digitraffic บังคับว่าต้องมี
  const res = await fetch(DT_BASE + path, { headers: DT_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function useDigitrafficVessels(enabled) {
  const [state, setState] = React.useState({
    vessels: [], at: null, error: null, loading: false, moving: 0,
  });
  const metaRef = React.useRef({ at: 0, byMmsi: null });

  React.useEffect(() => {
    if (!enabled) {
      setState({ vessels: [], at: null, error: null, loading: false, moving: 0 });
      return;
    }
    let alive = true, timer = null, fails = 0;
    setState(s => ({ ...s, loading: true }));

    const schedule = (ms) => { if (alive) timer = setTimeout(pull, ms); };

    async function pull() {
      try {
        // ข้อมูลนิ่ง (ชื่อ/ประเภท/ปลายทาง) ดึงซ้ำนาน ๆ ครั้ง ไม่ใช่ทุกรอบ
        const now = Date.now();
        if (!metaRef.current.byMmsi || now - metaRef.current.at > DT_META_MAX_MS) {
          const list = await dtFetch("/vessels");
          const byMmsi = {};
          (list || []).forEach(v => { byMmsi[v.mmsi] = v; });
          metaRef.current = { at: now, byMmsi };
        }
        const meta = metaRef.current.byMmsi || {};

        const geo = await dtFetch("/locations");
        if (!alive) return;

        const t = Date.now();
        const vessels = (geo.features || []).map(f => {
          const p = f.properties || {};
          const c = (f.geometry && f.geometry.coordinates) || [];
          const m = meta[p.mmsi] || {};
          // heading 511 = ไม่มีข้อมูลตามมาตรฐาน AIS ไม่ใช่ทิศ 511 องศา
          const hdg = (typeof p.heading === "number" && p.heading !== 511) ? p.heading : null;
          return {
            id:      "dt_" + p.mmsi,
            mmsi:    p.mmsi,
            lat:     c[1],
            lon:     c[0],
            sp:      typeof p.sog === "number" ? p.sog : 0,
            course:  typeof p.cog === "number" ? p.cog : 0,
            heading: hdg,
            navStat: p.navStat,
            name:    m.name || String(p.mmsi),
            type:    dtShipKind(m.shipType),
            imo:     m.imo || null,
            dest:    m.destination || "",
            flag:    "",
            status:  "normal",
            ageSec:  p.timestampExternal ? Math.max(0, Math.round((t - p.timestampExternal) / 1000)) : null,
          };
        }).filter(v => typeof v.lat === "number" && typeof v.lon === "number");

        fails = 0;
        setState({
          vessels,
          at: geo.dataUpdatedTime || null,
          error: null,
          loading: false,
          moving: vessels.filter(v => v.sp > 0.5).length,
        });
        schedule(DT_POLL_MS);
      } catch (e) {
        if (!alive) return;
        fails += 1;
        // ไม่ค้างค่าเก่าไว้เป็นค่าปัจจุบัน — บอกตรง ๆ ว่าดึงไม่ได้
        setState(s => ({ ...s, error: String(e.message || e), loading: false }));
        schedule(fails <= 4 ? DT_RETRY_MS : DT_POLL_MS);
      }
    }

    pull();
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled]);

  return state;
}

Object.assign(window, { useDigitrafficVessels, dtShipKind });
