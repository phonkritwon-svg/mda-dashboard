/* ============================================================
   Events / Incidents — central store via Supabase
   เหตุการณ์มาจากตาราง public.events:
     • cron สร้างอัตโนมัติจากข่าวภัยสูง (origin='cron')
     • เจ้าหน้าที่เพิ่มเองผ่านฟอร์ม (origin='manual')
   อ่านได้ทุกคน · เขียนได้เฉพาะผู้ login (RLS) หรือ cron (service_role)
   ============================================================ */

const EVENTS_CACHE_KEY  = "MDA_EVENTS_v1";
const EVENTS_REFRESH_MS = 5 * 60 * 1000;   // sync ทุก 5 นาที

/* พื้นที่ทางทะเลพร้อมพิกัด (ใช้ในฟอร์มเพิ่มเหตุการณ์) */
const REGION_PRESETS = [
  { key: "redsea",   th: "ทะเลแดง / บับเอลมันเดบ", en: "Red Sea / Bab el-Mandeb", lat: 13.5, lon: 43.3 },
  { key: "hormuz",   th: "ช่องแคบฮอร์มุซ",         en: "Strait of Hormuz",       lat: 26.5, lon: 56.3 },
  { key: "aden",     th: "อ่าวเอเดน",              en: "Gulf of Aden",           lat: 12.5, lon: 47.0 },
  { key: "scs",      th: "ทะเลจีนใต้",             en: "South China Sea",        lat: 15.0, lon: 117.0 },
  { key: "malacca",  th: "ช่องแคบมะละกา",          en: "Strait of Malacca",      lat: 2.5,  lon: 101.0 },
  { key: "gulfthai", th: "อ่าวไทย",               en: "Gulf of Thailand",       lat: 9.5,  lon: 101.5 },
  { key: "andaman",  th: "ทะเลอันดามัน",           en: "Andaman Sea",            lat: 8.0,  lon: 97.0 },
  { key: "natuna",   th: "ทะเลนาตูนาเหนือ",        en: "North Natuna Sea",       lat: 5.0,  lon: 109.2 },
  { key: "black",    th: "ทะเลดำ",                en: "Black Sea",              lat: 44.0, lon: 36.0 },
  { key: "baltic",   th: "ทะเลบอลติก",            en: "Baltic Sea",             lat: 59.0, lon: 21.0 },
  { key: "custom",   th: "กำหนดพิกัดเอง",          en: "Custom coordinates",     lat: 0,    lon: 0 },
];

/* จับคู่ข้อความข่าว → พิกัดพื้นที่ทางทะเล (ใช้ปักหมุด "ดูบนแผนที่" จากฟีดข่าว)
   ตรงกับชุดภูมิภาคในฝั่ง cron (api/cron-news.py) */
const MDA_GEO_REGIONS = [
  { re: /red sea|bab[- ]?el[- ]?mandeb|hodeida|yemen|ทะเลแดง|บับเอล/i,        th: "ทะเลแดง / บับเอลมันเดบ",    en: "Red Sea / Bab el-Mandeb", lat: 13.5, lon: 43.3 },
  { re: /strait of hormuz|hormuz|fujairah|persian gulf|ช่องแคบฮอร์มุซ/i,      th: "ช่องแคบฮอร์มุซ",            en: "Strait of Hormuz",        lat: 26.5, lon: 56.3 },
  { re: /gulf of aden|\baden\b|อ่าวเอเดน/i,                              th: "อ่าวเอเดน",                 en: "Gulf of Aden",            lat: 12.5, lon: 47.0 },
  { re: /south china sea|scarborough|spratly|paracel|second thomas|taiwan strait|ทะเลจีนใต้|สการ์โบโรห์|พารา?เซล|สปร(?:าต|ตลี)|ทะเลจีน/i, th: "ทะเลจีนใต้", en: "South China Sea", lat: 15.0, lon: 117.0 },
  { re: /strait of malacca|malacca|singapore strait|ช่องแคบมะละกา|มะละกา|สิงค์โปร์|singapor/i,         th: "ช่องแคบมะละกา",             en: "Strait of Malacca",       lat: 2.5,  lon: 101.0 },
  /* ── ชายแดนทะเลไทย–กัมพูชา (ต้องตรวจก่อน "อ่าวไทย" ที่กว้างกว่า) ── */
  { re: /ko ?kut|koh ?kood|เกาะกูด/i,                          th: "เกาะกูด",                   en: "Ko Kut",                  lat: 11.65, lon: 102.58 },
  { re: /koh ?kong|เกาะกง/i,                                  th: "เกาะกง",                    en: "Koh Kong",                lat: 11.6,  lon: 103.0 },
  { re: /\btrat\b|ตราด/i,                                      th: "ตราด",                      en: "Trat",                    lat: 12.0,  lon: 102.5 },
  { re: /overlapping claims|\boca\b|พื้นที่อ้างสิทธิทับซ้อน|พื้นที่ทับซ้อน/i, th: "พื้นที่อ้างสิทธิทับซ้อน (อ่าวไทย)", en: "Gulf of Thailand OCA", lat: 8.0, lon: 102.5 },
  { re: /gulf of thailand|อ่าวไทย|ท้องอ่าว/i,                                   th: "อ่าวไทย",                   en: "Gulf of Thailand",        lat: 9.5,  lon: 101.5 },
  { re: /andaman|ทะเลอันดามัน|อนุดามัน/i,                                            th: "ทะเลอันดามัน",              en: "Andaman Sea",             lat: 8.0,  lon: 97.0 },
  { re: /natuna|นาตูนา/i,                                             th: "ทะเลนาตูนาเหนือ",           en: "North Natuna Sea",        lat: 5.0,  lon: 109.2 },
  { re: /black sea|novorossiysk|odes[as]|crimea|ทะเลดำ|โนโวรอสซีสค์/i,            th: "ทะเลดำ",                    en: "Black Sea",               lat: 44.0, lon: 36.0 },
  { re: /baltic|gulf of finland|kattegat|gotland|ทะเลบอลติก|บอลติก/i,           th: "ทะเลบอลติก",                en: "Baltic Sea",              lat: 59.0, lon: 21.0 },
  { re: /gulf of guinea|nigeria|lagos|อ่าวกินี/i,                       th: "อ่าวกินี",                  en: "Gulf of Guinea",          lat: 3.0,  lon: 5.0 },
  { re: /somali|horn of africa|gulf of oman|arabian sea|สโมลี|โซมาเลีย|ทะเลอาหรับ/i,    th: "ทะเลอาหรับ / จะงอยแอฟริกา", en: "Arabian Sea / Horn",      lat: 12.0, lon: 55.0 },
  { re: /caribbean|venezuela|panama canal|ทะเลแคริบเบียน/i,                   th: "ทะเลแคริบเบียน",            en: "Caribbean Sea",           lat: 14.0, lon: -72.0 },

  /* ── ท่าเรือ / แม่น้ำ / เมืองท่า (เจาะจง — ต้องมาก่อนระดับประเทศ) ── */
  { re: /\brhine\b|duisburg|แม่น้ำไรน์/i,                       th: "แม่น้ำไรน์ (เยอรมนี)",       en: "Rhine (Germany)",         lat: 51.4, lon: 6.8 },
  { re: /\bdanube\b|แม่น้ำดานูบ/i,                              th: "แม่น้ำดานูบ",               en: "Danube",                  lat: 45.4, lon: 19.3 },
  { re: /rotterdam|antwerp|ร็อตเตอร์ดัม/i,                      th: "ร็อตเตอร์ดัม–แอนต์เวิร์ป",    en: "Rotterdam–Antwerp",       lat: 51.9, lon: 4.1 },
  { re: /shanghai|ningbo|qingdao|\bwuhu\b|yangtze|เซี่ยงไฮ้/i,  th: "ชายฝั่งจีนตะวันออก",         en: "East China Coast",        lat: 31.0, lon: 122.5 },
  { re: /yokosuka|\btokyo\b|\bosaka\b|โยโกสุกะ/i,               th: "ญี่ปุ่น",                   en: "Japan",                   lat: 35.2, lon: 139.7 },
  { re: /\bbusan\b|incheon|ปูซาน/i,                             th: "เกาหลีใต้",                 en: "South Korea",             lat: 35.1, lon: 129.1 },
  { re: /norfolk|wallops|chesapeake|newport news/i,             th: "ชายฝั่งตะวันออกสหรัฐฯ",       en: "US East Coast",           lat: 36.9, lon: -76.0 },
  { re: /pearl harbor|\bguam\b|เพิร์ลฮาร์เบอร์/i,               th: "แปซิฟิกตะวันตก (สหรัฐฯ)",     en: "West Pacific (US)",       lat: 21.3, lon: -157.9 },
  { re: /santos|petrobras|rio de janeiro|\bbrazil/i,            th: "บราซิล / แอตแลนติกใต้",      en: "Brazil / S. Atlantic",    lat: -23.5, lon: -43.0 },
  { re: /argentin|river plate|parana river|buenos aires/i,      th: "อาร์เจนตินา",               en: "Argentina",               lat: -35.0, lon: -57.0 },

  /* ── ระดับประเทศ / กองทัพเรือ (ข่าวจัดซื้อ-ต่อเรือมักไม่ระบุพิกัด) ── */
  { re: /royal navy|\buk\b|united kingdom|britain|british|portsmouth|devonport|ราชนาวีอังกฤษ|อังกฤษ/i,
                                                                th: "สหราชอาณาจักร / ทะเลเหนือ",  en: "United Kingdom / North Sea", lat: 55.0, lon: 1.0 },
  { re: /netherlands|dutch|\brnln\b|hnlms|เนเธอร์แลนด์/i,       th: "เนเธอร์แลนด์",              en: "Netherlands",             lat: 52.6, lon: 4.2 },
  { re: /\bgermany\b|german navy|rheinmetall|\bfgs\b|เยอรมนี/i, th: "เยอรมนี",                   en: "Germany",                 lat: 54.2, lon: 8.5 },
  { re: /\bspain\b|spanish navy|\bindra\b|ferrol|cadiz|สเปน/i,  th: "สเปน",                      en: "Spain",                   lat: 42.5, lon: -9.5 },
  { re: /\bitaly\b|italian navy|sicily|\bgenoa\b|อิตาลี/i,      th: "อิตาลี",                    en: "Italy",                   lat: 40.0, lon: 13.5 },
  { re: /\bgreece\b|greek|piraeus|กรีซ/i,                       th: "กรีซ",                      en: "Greece",                  lat: 37.5, lon: 24.5 },
  { re: /\bmalta\b|มอลตา/i,                                     th: "มอลตา",                     en: "Malta",                   lat: 35.9, lon: 14.5 },
  { re: /\bturkey\b|turkish|\biraq\b|ตุรกี|อิรัก/i,             th: "ตุรกี–อิรัก",               en: "Turkey–Iraq",             lat: 36.8, lon: 35.0 },
  { re: /\bhungary\b|ฮังการี/i,                                 th: "ฮังการี (ยุโรปกลาง)",        en: "Hungary (C. Europe)",     lat: 47.5, lon: 19.0 },
  { re: /\bcanada\b|canadian|แคนาดา/i,                          th: "แคนาดา",                    en: "Canada",                  lat: 48.5, lon: -63.0 },
  { re: /\baustralia\b|\brann\b|australian navy|ออสเตรเลีย/i,    th: "ออสเตรเลีย",                en: "Australia",               lat: -33.9, lon: 151.5 },
  { re: /\bindia\b|indian navy|mumbai|cochin|hindustan|อินเดีย/i, th: "อินเดีย",                 en: "India",                   lat: 18.9, lon: 72.5 },
  { re: /\bchina\b|chinese|จีน/i,                               th: "จีน",                       en: "China",                   lat: 30.0, lon: 123.0 },
  { re: /jones act|\bus navy\b|u\.s\. navy|american|white house|virginia-class|saildrone|สหรัฐ/i,
                                                                th: "สหรัฐอเมริกา",              en: "United States",           lat: 38.0, lon: -74.0 },

  /* ── มหาสมุทร / ทะเลกว้าง (ตัวสุดท้าย — ใช้เมื่อไม่เจอที่เจาะจงกว่า) ── */
  { re: /mediterranean|aegean|libya|gaza|ทะเลเมดิเตอร์/i,       th: "ทะเลเมดิเตอร์เรเนียน",       en: "Mediterranean Sea",       lat: 34.0, lon: 18.0 },
  { re: /north sea|norway|norwegian|denmark|ทะเลเหนือ|นอร์เวย์/i, th: "ทะเลเหนือ",                en: "North Sea",               lat: 56.5, lon: 3.0 },
  { re: /arctic|icebreaker|svalbard|greenland|อาร์กติก|เรือตัดน้ำแข็ง/i, th: "มหาสมุทรอาร์กติก",   en: "Arctic Ocean",            lat: 78.0, lon: 15.0 },
  { re: /indian ocean|มหาสมุทรอินเดีย/i,                        th: "มหาสมุทรอินเดีย",           en: "Indian Ocean",            lat: 5.0,  lon: 75.0 },
  { re: /pacific|แปซิฟิก/i,                                     th: "มหาสมุทรแปซิฟิก",           en: "Pacific Ocean",           lat: 5.0,  lon: 175.0 },
  { re: /atlantic|แอตแลนติก/i,                                  th: "มหาสมุทรแอตแลนติก",         en: "Atlantic Ocean",          lat: 28.0, lon: -40.0 },
];

// รับข้อความหลายชิ้น (หัวข้อ/สรุป ไทย+อังกฤษ) → {lat, lon, th, en} หรือ null
function geocodeText() {
  const text = Array.prototype.slice.call(arguments).filter(Boolean).join("  ");
  for (let i = 0; i < MDA_GEO_REGIONS.length; i++) {
    const r = MDA_GEO_REGIONS[i];
    if (r.re.test(text)) return { lat: r.lat, lon: r.lon, th: r.th, en: r.en };
  }
  return null;
}

/* ============================================================
   ดึง "หมุดเรือ" จากข่าว — สแกนชื่อเรือ + ประเภท + พื้นที่ในข่าว
   แล้วปักตำแหน่งโดยประมาณบนแผนที่ (ทดแทนเรือ dummy เดิม)
   ============================================================ */
const VESSEL_NAME_RE = /\b(MV|MT|MSC|FV|SS|USS|HMS|RFA|FGS|HNLMS|JS|INS|PNS|KRI|BRP|CCG)\s+([A-Z][A-Za-z0-9'.’\-]+(?:\s+[A-Z0-9][A-Za-z0-9'.’\-]+){0,2})/;

const VESSEL_TYPE_HINTS = [
  { type: "dark",    re: /shadow fleet|ghost fleet|dark fleet|sanctioned (?:vessel|tanker|ship)|ais (?:gap|off|spoof)/i },
  { type: "navy",    re: /\b(?:uss|hms|rfa|fgs|warship|frigate|destroyer|corvette|cutter)\b|coast guard|navy|naval|patrol (?:vessel|ship|boat)/i },
  { type: "fishing", re: /fishing (?:vessel|boat|fleet)|trawler|\bfv\b|seiner|jigger|iuu/i },
  { type: "tanker",  re: /\btanker|\bmt\b|crude|vlcc|product carrier|lng carrier|lpg|oil (?:tanker|products)/i },
  { type: "cargo",   re: /container|bulk(?:er| carrier)|cargo ship|freighter|\bmv\b|ro-?ro|general cargo|box ship/i },
];

function _vesselType(text) {
  for (let i = 0; i < VESSEL_TYPE_HINTS.length; i++) {
    if (VESSEL_TYPE_HINTS[i].re.test(text)) return VESSEL_TYPE_HINTS[i].type;
  }
  return "cargo";
}

const VESSEL_MENTION_RE = /\b(vessel|ship|tanker|boat|carrier|bulker|bulk|trawler|warship|frigate|destroyer|fleet|fishing|cargo|container|naval|coast guard|skiff|dhow)\b/i;
// เรือจะ "เฝ้าระวัง" ก็ต่อเมื่อข่าวบ่งชี้เหตุภัยจริง มิฉะนั้นนับเป็นเรือปกติ
const VESSEL_ALERT_RE = /attack|struck|missile|drone|hijack|seiz|capsiz|sink|sunk|piracy|pirate|illegal|smuggl|detain|collision|distress|sabotage|incursion|shadow fleet|ghost fleet/i;

// รับรายการข่าว → คืน array ของเรือที่ปักหมุดได้ (มีชื่อ/ประเภท/พิกัด)
function extractVesselsFromNews(newsArr) {
  const out = [];
  let idx = 0;
  (newsArr || []).forEach(n => {
    const en  = (n.raw && (n.raw.en || n.raw.th)) || "";
    const th  = (n.raw && n.raw.th) || "";
    const sum = (n.ai && (n.ai.en || n.ai.th)) || "";
    const sth = (n.ai && n.ai.th) || "";
    const hay = [en, sum, th, sth, n.outlet].join("  ");
    // ข่าวต้องพูดถึงเรือ หรือมีชื่อเรือชัดเจน (MV/MT/USS…)
    if (!VESSEL_MENTION_RE.test(hay) && !VESSEL_NAME_RE.test(en) && !VESSEL_NAME_RE.test(sum)) return;
    const geo = geocodeText(en, th, sum, sth, n.outlet);
    if (!geo) return;                                   // ต้องระบุพื้นที่ได้
    const m = VESSEL_NAME_RE.exec(en) || VESSEL_NAME_RE.exec(sum);
    const name = m ? (m[1] + " " + m[2]).trim() : null;
    const type = _vesselType(hay);
    // กระจายตำแหน่งรอบจุดศูนย์กลางภูมิภาค ไม่ให้หมุดทับกัน
    const ang = (idx * 47) % 360, r = 0.5 + (idx % 6) * 0.45;
    idx++;
    out.push({
      id:     "nv_" + (n.id || idx),
      name:   name || (type === "navy" ? "Naval unit" : "Vessel") + " · " + geo.en,
      flag:   "??",
      type:   type,
      course: 0, sp: 0,
      lat:    geo.lat + r * Math.cos(ang * Math.PI / 180),
      lon:    geo.lon + r * Math.sin(ang * Math.PI / 180),
      status: VESSEL_ALERT_RE.test(hay) ? "watch" : "normal",
      fromNews: true,
      url:    n.url,
      region: geo,
      note:   { th: th || en, en: en || th },
    });
  });
  return out;
}

/* ============================================================
   เหตุการณ์เฝ้าระวังจากข่าว — คู่ขนานฝั่งเบราว์เซอร์ของ to_event_row()
   ใน api/cron-news.py

   ทำไมต้องมีสองที่:
     cron เขียนเหตุการณ์ลง Supabase วันละครั้ง ถ้าตารางว่าง ต่อ Supabase
     ไม่ได้ หรือข่าวเพิ่งเข้ามาหลัง cron รอบล่าสุด หน้าเหตุการณ์จะโล่งสนิท
     ทั้งที่ฟีดข่าวมีข่าวภัยจริงอยู่ตรงหน้า — อนุมานจากข่าวที่โหลดมาแล้ว
     จึงเติมช่องว่างนั้นได้โดยไม่ต้องรอ

   ใช้ regex ชุดเดียวกับฝั่ง cron เป๊ะ ๆ (SEV_CRIT / SEV_HIGH / THREAT_CATS)
   บวกคำไทย เพราะข่าวถูกแปลเป็นไทยแล้ว ถ้าจับแต่อังกฤษจะพลาดของที่แปลไปแล้ว
   ============================================================ */
/* "โจมตี" เดี่ยว ๆ ใช้ไม่ได้เป็นเกณฑ์ความรุนแรง — ภาษาไทยใช้คำนี้แปลทั้ง
   attack, hits, strikes, slams ผลที่วัดได้คือ "ไต้ฝุ่นโจมตีโอกินาวา" และ
   "สหภาพแรงงานบุกโจมตีท่าเรือ" กลายเป็นเหตุวิกฤตทางความมั่นคงไปด้วย
   จึงบังคับให้คู่กับเป้าหมายหรืออาวุธเสมอ                                */
const EV_SEV_CRIT = /\b(attacked|missile|drone strike|explosion|killed|sunk|sinking|hijack|under fire|ballistic|opened fire)\b|attack on (a )?(ship|vessel|tanker|port)|โจมตีเรือ|โจมตีท่าเรือ|ขีปนาวุธ|ระเบิด|เสียชีวิต|จมลง|อับปาง|จี้เรือ|ยิงใส่/i;
const EV_SEV_HIGH = /\b(seiz|detain|collision|capsiz|distress|piracy|pirate|smuggl|illegal fishing|incursion|intercept|boarded|sabotage)\b|ยึดเรือ|ควบคุมตัว|ชนกัน|พลิกคว่ำ|ขอความช่วยเหลือ|โจรสลัด|ลักลอบ|ประมงผิดกฎหมาย|รุกล้ำ|สกัดกั้น|ก่อวินาศกรรม/i;

/* ข่าวที่ "พูดถึง" ภัยแต่ไม่ใช่เหตุการณ์ — จัดซื้อ งบประมาณ ต่อเรือ ซ้อมรบ
   ทดลองอาวุธ ข่าวธุรกิจ ล้วนเต็มไปด้วยคำว่าโดรน ขีปนาวุธ เรือรบ
   ถ้าไม่กันออก แผงเฝ้าระวังจะเต็มไปด้วยข่าวจัดซื้อจนของจริงจมหาย        */
const EV_NOT_INCIDENT = /\b(order|orders|ordered|contract|tender|procure|procurement|budget|billion|cost|deliver(y|ed)|christen|keel|shipyard|exercise|drill|trial|prototype|concept|unveil|explores?|study|report says)\b|คำสั่งซื้อ|สัญญา|งบประมาณ|จัดซื้อ|จัดหา|ต่อเรือ|อู่ต่อเรือ|ซ้อมรบ|ทดสอบ|ทดลอง|ต้นแบบ|เปิดตัว|ผลการศึกษา|พันล้าน/i;

/* หมวดก่อการร้ายต้องมี "ตัวแสดงหรืออาวุธ" ไม่ใช่แค่คำว่าโจมตี
   ของฝั่ง cron ใส่ attack|struck ไว้ในหมวดนี้ด้วย ผลคือข่าวอะไรก็ตามที่มี
   คำว่าโจมตีอยู่ในบทสรุป ถูกเหมาเป็นก่อการร้ายทางทะเลหมด (วัดได้ 14 จาก 17)
   ถ้าไม่มีตัวบ่งชี้ชัดก็ปล่อยให้ตกไปเป็น MARITIME ตามปกติ ตรงไปตรงมากว่า */
const EV_CATS = [
  ["SEARCH & RESCUE",    /rescue|distress|capsiz|sinking|missing|overboard|search and rescue|ค้นหา|ช่วยเหลือ|สูญหาย|พลิกคว่ำ|อับปาง/i],
  ["PIRACY",             /piracy|pirate|armed robbery|hijack|kidnap|โจรสลัด|ปล้น|จี้เรือ|ลักพา/i],
  ["IUU FISHING",        /illegal fishing|\biuu\b|trawler|poach|ประมงผิดกฎหมาย|เรือประมง|รุกล้ำ|ลอบจับ/i],
  ["MARITIME TERRORISM", /houthi|militant|terror|limpet mine|\bied\b|missile|drone strike|ฮูตี|ก่อการร้าย|ขีปนาวุธ|ทุ่นระเบิด/i],
  ["DRUG & ARMS",        /drug|narcotic|smuggl|contraband|weapons? seiz|ยาเสพติด|ลักลอบ|อาวุธ/i],
  ["SUBSEA / INFRA",     /cable|pipeline|sabotage|infrastructure|สายเคเบิล|ท่อ|ก่อวินาศกรรม|โครงสร้างพื้นฐาน/i],
];

/* ข่าวจาก Supabase เก็บ time เป็น ISO ส่วนข่าวตั้งต้นเก็บเป็น "07:30" อยู่แล้ว
   ถ้าปล่อยผ่าน ช่องเวลาบนแผงจะโชว์ 2026-08-09T06:10:48.000Z ดิบ ๆ
   จัดรูปแบบให้ตรงกับเหตุการณ์จาก Supabase (eventRowToObj) จะได้ดูเป็นชุดเดียวกัน */
function evTimeLabel(t) {
  if (!t) return "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(t))) return String(t);   // "07:30" — ใช้ได้เลย
  const d = new Date(t);
  if (isNaN(d)) return String(t);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* หน้ารายละเอียดเหตุการณ์เขียนว่า "({ago} ที่แล้ว)" จึงต้องส่งเฉพาะปริมาณ
   เช่น "45 นาที" ไม่ใช่ "45 นาทีที่แล้ว" ซึ่งเป็นสิ่งที่ mdaTimeAgo คืนมา
   ข้อมูลตั้งต้นใน data.js เก็บแบบสั้นอยู่แล้ว ตัวที่ผ่าน mdaTimeAgo จึงอ่านว่า
   "1 วันที่แล้ว ที่แล้ว" — ตัดคำต่อท้ายออกให้เข้ารูปเดียวกัน */
function evAgo(t) {
  if (!t || !window.mdaTimeAgo) return { th: "", en: "" };
  const strip = (s) => String(s || "").replace(/ที่แล้ว$/, "").replace(/\s+ago$/, "").trim();
  return { th: strip(window.mdaTimeAgo(t, "th")), en: strip(window.mdaTimeAgo(t, "en")) };
}

function extractEventsFromNews(newsArr) {
  const out = [];
  (newsArr || []).forEach(n => {
    // กฎเดียวกับฟีดข่าว: ไม่มีลิงก์ต้นฉบับตรวจสอบได้ = ไม่นับเป็นเหตุการณ์
    if (window.hasVerifiableSource && !window.hasVerifiableSource(n)) return;

    const en  = (n.raw && (n.raw.en || n.raw.th)) || "";
    const th  = (n.raw && n.raw.th) || "";
    const sum = (n.ai && (n.ai.en || n.ai.th)) || "";
    const sth = (n.ai && n.ai.th) || "";
    const hay = [en, th, sum, sth].join("  ");
    /* ระดับความรุนแรงอ่านจาก "พาดหัว" เท่านั้น ไม่รวมบทสรุป
       บทสรุปมักเล่าภูมิหลัง ("หลังเหตุโจมตีเมื่อเดือนก่อน…") คำรุนแรงจึงโผล่
       แม้ในข่าวที่ไม่ใช่เหตุรุนแรง — วัดแล้วทำให้ 15 จาก 17 ชิ้นเป็นวิกฤต
       รวมข่าวคลี่คลายอย่าง "ตกลงเปิดเส้นทางปลอดภัย" พาดหัวคือสิ่งที่บอกว่า
       "เกิดอะไรขึ้น" จริง ๆ ส่วนหมวดหมู่ยังดูทั้งชิ้นได้ เพราะเป็นเรื่องหัวข้อ */
    const headline = [en, th].join("  ");

    const geo = geocodeText(en, th, sum, sth, n.outlet);
    if (!geo) return;                       // ระบุพื้นที่ไม่ได้ = ปักหมุดไม่ได้
    if (EV_NOT_INCIDENT.test(headline)) return;   // ข่าวจัดซื้อ/ซ้อม/ธุรกิจ

    let sev = EV_SEV_CRIT.test(headline) ? "critical"
            : (EV_SEV_HIGH.test(headline) ? "high" : null);
    const catHit = EV_CATS.find(c => c[1].test(hay));
    if (!sev && !catHit) return;            // ไม่มีสัญญาณภัยเลย = เป็นข่าวเฉย ๆ ไม่ใช่เหตุการณ์

    out.push({
      id:       "news_" + (n.id || out.length),
      sev:      sev || "medium",
      cat:      catHit ? catHit[0] : "MARITIME",
      srcKey:   n.srcKey || null,
      time:     evTimeLabel(n.time),
      /* หน้ารายละเอียดพิมพ์ "รายงานเมื่อ X (Y ที่แล้ว)" — ถ้า ago ว่าง
         จะเหลือวงเล็บเปล่า ๆ จึงคำนวณเองจากเวลาข่าวเมื่อข่าวไม่ได้ให้มา */
      ago:      (n.ago && (n.ago.th || n.ago.en)) ? n.ago : evAgo(n.time),
      region:   { th: geo.th, en: geo.en },
      area:     { th: geo.th, en: geo.en },
      title:    { th: th || en, en: en || th },
      summary:  { th: sth || sum, en: sum || sth },
      lat:      geo.lat,
      lon:      geo.lon,
      vessel:   null,
      conf:     n.credibility || 3,
      tags:     [],
      source:   { outlet: n.outlet || "", url: n.url || "" },
      resolved: false,
      origin:   "news",                     // แยกจาก "cron"/"manual" ได้ที่ปลายทาง
      publishedAt: n.publishedAt || null,
      newsItem: n,                          // ให้หน้ารายละเอียดย้อนกลับไปที่ข่าวต้นทางได้
    });
  });
  return out;
}

/* รวมเหตุการณ์จากฐานข้อมูลกับที่อนุมานจากข่าว
   ของจาก Supabase ถือเป็นตัวจริงเสมอ — ถ้าซ้ำลิงก์กัน ให้ตัวอนุมานหลีกทาง
   มิฉะนั้นเหตุการณ์เดียวจะโผล่สองครั้งหลัง cron ทำงาน */
function mergeEvents(dbEvents, newsEvents) {
  const seen = new Set(
    (dbEvents || []).map(e => (e.source && e.source.url) || "").filter(Boolean)
  );
  const extra = (newsEvents || []).filter(e => !seen.has(e.source.url));
  const sev = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...(dbEvents || []), ...extra].sort(
    (a, b) => (sev[a.sev] ?? 9) - (sev[b.sev] ?? 9)
  );
}

/* ============================================================
   จุดข่าวบนแผนที่ — อ่านข่าว "ทุกชิ้น" หาพื้นที่จากเนื้อข่าว
   แล้วปักหมุดทั้งหมด (ไม่จำกัดเฉพาะข่าวที่พูดถึงเรือ)
   ============================================================ */
function extractNewsPointsFromNews(newsArr) {
  const out = [];
  const seenPerRegion = {};          // นับจำนวนข่าวต่อภูมิภาค เพื่อกระจายไม่ให้จุดทับกัน

  (newsArr || []).forEach(n => {
    const en  = (n.raw && (n.raw.en || n.raw.th)) || "";
    const th  = (n.raw && n.raw.th) || "";
    const sum = (n.ai && (n.ai.en || n.ai.th)) || "";
    const sth = (n.ai && n.ai.th) || "";

    const geo = geocodeText(en, th, sum, sth, n.outlet);
    if (!geo) return;                // ข่าวที่ระบุพื้นที่ไม่ได้ → ไม่ปักหมุด

    // สีจุดตามด้านภัยคุกคามของข่าว (ถ้าจับได้) มิฉะนั้นใช้สีข่าวทั่วไป
    const domKeys = window.classifyThreats ? window.classifyThreats(n) : [];
    const domMeta = window.MDA_THREAT_DOMAINS || [];
    const dom = domKeys.length ? domMeta.find(d => d.key === domKeys[0]) : null;

    // กระจายแบบก้นหอย (golden angle) รอบจุดศูนย์กลางภูมิภาค
    const i = seenPerRegion[geo.en] || 0;
    seenPerRegion[geo.en] = i + 1;
    const ang = i * 137.5 * Math.PI / 180;
    const rad = i === 0 ? 0 : 0.5 * Math.sqrt(i);

    out.push({
      id:      "np_" + (n.id || out.length),
      lat:     geo.lat + rad * Math.cos(ang),
      lon:     geo.lon + rad * Math.sin(ang),
      color:   dom ? dom.color : "#5fb0c9",
      domain:  dom ? { key: dom.key, th: dom.th, en: dom.en } : null,
      title:   { th: th || en, en: en || th },
      outlet:  n.outlet,
      srcKey:  n.srcKey,
      time:    n.time,
      url:     n.url,
      region:  geo,
      item:    n,                    // ส่งข่าวต้นฉบับไปเปิดหน้ารายละเอียดได้
    });
  });
  return out;
}

/* ---- row (DB) <-> object (UI) ---- */
function eventRowToObj(r) {
  const t = r.published_at || r.created_at;
  const timeStr = t
    ? new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  // ส่งเฉพาะปริมาณ ไม่รวมคำว่า "ที่แล้ว" — ดูเหตุผลที่ evAgo()
  const ago = evAgo(t);
  return {
    id:      r.id,
    sev:     r.sev || "medium",
    cat:     r.cat || "MARITIME",
    srcKey:  r.src_key || null,
    time:    timeStr,
    ago,
    region:  { th: r.region_th || r.region_en || "", en: r.region_en || r.region_th || "" },
    area:    { th: r.area_th   || r.area_en   || "", en: r.area_en   || r.area_th   || "" },
    title:   { th: r.title_th  || r.title_en  || "", en: r.title_en  || r.title_th  || "" },
    summary: { th: r.summary_th|| r.summary_en|| "", en: r.summary_en|| r.summary_th|| "" },
    lat:     r.lat,
    lon:     r.lon,
    vessel:  r.vessel || null,
    conf:    r.conf || 3,
    tags:    r.tags || [],
    source:  { outlet: r.source_outlet || "", url: r.source_url || "" },
    resolved: !!r.resolved,
    origin:  r.origin || "manual",
    publishedAt: t,
  };
}

function eventObjToRow(o) {
  const dif = (a, b) => (a && a !== b ? a : null);
  return {
    id:            o.id,
    sev:           o.sev,
    cat:           o.cat,
    src_key:       o.srcKey || null,
    title_en:      o.title.en,
    title_th:      dif(o.title.th, o.title.en),
    area_en:       o.area.en,
    area_th:       dif(o.area.th, o.area.en),
    region_en:     o.region.en,
    region_th:     dif(o.region.th, o.region.en),
    summary_en:    o.summary.en,
    summary_th:    dif(o.summary.th, o.summary.en),
    lat:           o.lat,
    lon:           o.lon,
    vessel:        o.vessel || null,
    conf:          o.conf || 3,
    tags:          o.tags || [],
    source_outlet: o.source.outlet || null,
    source_url:    o.source.url || null,
    resolved:      !!o.resolved,
    origin:        o.origin || "manual",
    published_at:  o.publishedAt || new Date().toISOString(),
  };
}

/* ---- Supabase read / write ---- */
async function loadEventsFromSupabase() {
  const SB = window.MDA_SB;
  if (!SB) return [];
  try {
    const { data, error } = await SB
      .from("events").select("*")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) { console.warn("[MDA] events read", error.message); return []; }
    return (data || []).map(eventRowToObj);
  } catch (e) {
    console.warn("[MDA] events read failed", e);
    return [];
  }
}

// คิวรีคลังเหตุการณ์ย้อนหลังตามช่วงเวลา (เข้าถึงประวัติทั้งหมด ไม่ติด limit 200)
async function queryEventsArchive(sinceISO, untilISO, limit) {
  const SB = window.MDA_SB;
  if (!SB) return [];
  try {
    let q = SB.from("events").select("*")
      .order("published_at", { ascending: false })
      .limit(limit || 2000);
    if (sinceISO) q = q.gte("published_at", sinceISO);
    if (untilISO) q = q.lte("published_at", untilISO);
    const { data, error } = await q;
    if (error) { console.warn("[MDA] events archive read", error.message); return []; }
    return (data || []).map(eventRowToObj);
  } catch (e) {
    console.warn("[MDA] events archive read failed", e);
    return [];
  }
}

async function addEventToSupabase(obj) {
  const SB = window.MDA_SB;
  if (!SB) return { error: "no_supabase" };
  try {
    const { error } = await SB.from("events").insert(eventObjToRow(obj));
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
}

/* ---- localStorage cache (offline fallback) ---- */
function loadEventsCache() {
  try { const r = localStorage.getItem(EVENTS_CACHE_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function saveEventsCache(items) {
  try { localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(items)); } catch {}
}

/* ---- React hook ---- */
function useEventsUpdater() {
  const [events, setEvents]   = React.useState(loadEventsCache);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const rows = await loadEventsFromSupabase();
    if (window.MDA_SB) { saveEventsCache(rows); setEvents(rows); }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    reload();
    const id = setInterval(reload, EVENTS_REFRESH_MS);
    return () => clearInterval(id);
  }, [reload]);

  // ── Supabase Realtime: เหตุการณ์ใหม่/อัปเดต เด้งเข้าทันที (~1 วินาที) ──
  React.useEffect(() => {
    const SB = window.MDA_SB;
    if (!SB || !SB.channel) return;
    const applyRow = (row) => {
      if (!row) return;
      const obj = eventRowToObj(row);
      setEvents(prev => {
        const map = new Map(prev.map(e => [e.id, e]));
        map.set(obj.id, obj);
        const arr = Array.from(map.values())
          .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
        saveEventsCache(arr);
        return arr;
      });
    };
    // ชื่อ channel ไม่ซ้ำต่อ instance — กันชน topic เดิมเมื่อ hook ถูกเรียกซ้ำ
    const ch = SB.channel("rt-events-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) => applyRow(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, (p) => applyRow(p.new))
      .subscribe();
    return () => { try { SB.removeChannel(ch); } catch (e) { /* ignore */ } };
  }, []);

  // เพิ่มเหตุการณ์: แสดงทันที (optimistic) แล้วพยายามบันทึกลง Supabase
  const addEvent = React.useCallback(async (obj) => {
    setEvents(prev => [obj, ...prev.filter(e => e.id !== obj.id)]);
    const res = await addEventToSupabase(obj);
    if (res.ok) reload();
    return res;
  }, [reload]);

  return { events, loading, reload, addEvent };
}

/* ============================================================
   ฟอร์มเพิ่มเหตุการณ์ (modal) + ปุ่มเรียก
   ============================================================ */
function AddEventModal({ open, onClose, lang, addEvent, showToast }) {
  const T = (th, en) => (lang === "th" ? th : en);
  const [f, setF] = React.useState({
    title: "", sev: "high", cat: "TERROR", regionKey: "redsea",
    lat: 13.5, lon: 43.3, summary: "", source: "", tags: "",
  });
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;

  const domains = window.MDA_THREAT_DOMAINS || [];
  const onRegion = (key) => {
    const p = REGION_PRESETS.find(r => r.key === key) || REGION_PRESETS[0];
    setF(s => ({ ...s, regionKey: key, lat: p.lat, lon: p.lon }));
  };
  const inputStyle = {
    background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 6,
    padding: "7px 9px", color: "var(--text)", fontFamily: "var(--font-ui)",
    fontSize: "var(--fs-sm)", outline: "none", width: "100%",
  };
  const label = (s) => <div className="dim up" style={{ fontSize: 9, marginBottom: 4 }}>{s}</div>;

  const submit = async () => {
    if (!f.title.trim()) { if (showToast) showToast(T("กรุณาใส่หัวข้อเหตุการณ์", "Please enter a title"), "warn"); return; }
    const region = REGION_PRESETS.find(r => r.key === f.regionKey) || REGION_PRESETS[0];
    const dom = domains.find(d => d.key === f.cat);
    const now = new Date().toISOString();
    const obj = {
      id: "evt_man_" + Date.now(),
      sev: f.sev,
      cat: dom ? dom.en.toUpperCase() : "MARITIME",
      srcKey: null,
      time: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      ago: { th: "เมื่อกี้", en: "just now" },
      region: f.regionKey === "custom"
        ? { th: T("กำหนดเอง", "Custom"), en: "Custom" }
        : { th: region.th, en: region.en },
      area:   f.regionKey === "custom"
        ? { th: T("กำหนดเอง", "Custom"), en: "Custom" }
        : { th: region.th, en: region.en },
      title:   { th: f.title.trim(), en: f.title.trim() },
      summary: { th: f.summary.trim(), en: f.summary.trim() },
      lat: parseFloat(f.lat) || 0,
      lon: parseFloat(f.lon) || 0,
      vessel: null,
      conf: 3,
      tags: f.tags.split(",").map(t => t.trim()).filter(Boolean),
      source: { outlet: T("เพิ่มโดยเจ้าหน้าที่", "Operator entry"), url: f.source.trim() },
      resolved: false,
      origin: "manual",
      publishedAt: now,
    };
    setBusy(true);
    const res = await addEvent(obj);
    setBusy(false);
    onClose();
    if (res && res.ok) {
      if (showToast) showToast(T("บันทึกเหตุการณ์ลงฐานข้อมูลแล้ว", "Event saved to database"), "ok");
    } else {
      if (showToast) showToast(
        T("แสดงเหตุการณ์แล้ว (ยังไม่บันทึก DB — ต้อง login เพื่อบันทึกถาวร)",
          "Event shown (not saved to DB — log in to persist)"), "warn");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 460, maxWidth: "92vw", background: "var(--surface-2)",
        border: "1px solid var(--border-2)", borderRadius: 12, overflow: "hidden",
        boxShadow: "var(--shadow)" }} onClick={ev => ev.stopPropagation()}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)",
          fontWeight: 600, display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="alert" size={15} style={{ color: "var(--accent)" }} />
          {T("เพิ่มเหตุการณ์ใหม่", "Add New Event")}
        </div>

        <div style={{ padding: 16, maxHeight: "72vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            {label(T("หัวข้อเหตุการณ์", "Event title"))}
            <input style={inputStyle} value={f.title} autoFocus
              placeholder={T("เช่น เรือบรรทุกน้ำมันถูกโจมตีใกล้ฮอร์มุซ", "e.g. Tanker attacked near Hormuz")}
              onChange={e => setF(s => ({ ...s, title: e.target.value }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {label(T("ระดับความรุนแรง", "Severity"))}
              <select style={inputStyle} value={f.sev} onChange={e => setF(s => ({ ...s, sev: e.target.value }))}>
                <option value="critical">{T("วิกฤต", "Critical")}</option>
                <option value="high">{T("สูง", "High")}</option>
                <option value="medium">{T("ปานกลาง", "Medium")}</option>
                <option value="low">{T("ต่ำ", "Low")}</option>
              </select>
            </div>
            <div>
              {label(T("ภัยคุกคาม (ศรชล.)", "Threat domain"))}
              <select style={inputStyle} value={f.cat} onChange={e => setF(s => ({ ...s, cat: e.target.value }))}>
                {domains.map(d => <option key={d.key} value={d.key}>{T(d.th, d.en)}</option>)}
              </select>
            </div>
          </div>

          <div>
            {label(T("พื้นที่", "Area / Region"))}
            <select style={inputStyle} value={f.regionKey} onChange={e => onRegion(e.target.value)}>
              {REGION_PRESETS.map(r => <option key={r.key} value={r.key}>{T(r.th, r.en)}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {label(T("ละติจูด (lat)", "Latitude"))}
              <input style={inputStyle} type="number" step="0.1" value={f.lat}
                onChange={e => setF(s => ({ ...s, lat: e.target.value }))} />
            </div>
            <div>
              {label(T("ลองจิจูด (lon)", "Longitude"))}
              <input style={inputStyle} type="number" step="0.1" value={f.lon}
                onChange={e => setF(s => ({ ...s, lon: e.target.value }))} />
            </div>
          </div>

          <div>
            {label(T("สรุปเหตุการณ์", "Summary"))}
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={f.summary}
              placeholder={T("รายละเอียดโดยย่อ…", "Brief details…")}
              onChange={e => setF(s => ({ ...s, summary: e.target.value }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {label(T("แท็ก (คั่นด้วย ,)", "Tags (comma-sep)"))}
              <input style={inputStyle} value={f.tags}
                placeholder="Houthi, Hormuz"
                onChange={e => setF(s => ({ ...s, tags: e.target.value }))} />
            </div>
            <div>
              {label(T("ลิงก์แหล่งข่าว", "Source URL"))}
              <input style={inputStyle} value={f.source} placeholder="https://…"
                onChange={e => setF(s => ({ ...s, source: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{T("ยกเลิก", "Cancel")}</button>
          <button className="btn btn-primary btn-sm" disabled={busy}
            style={{ opacity: f.title.trim() && !busy ? 1 : 0.5 }} onClick={submit}>
            <Icon name="check" size={13} />{busy ? T("กำลังบันทึก…", "Saving…") : T("เพิ่มเหตุการณ์", "Add Event")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEventButton({ addEvent, lang, showToast, className }) {
  const [open, setOpen] = React.useState(false);
  const T = (th, en) => (lang === "th" ? th : en);
  return (
    <React.Fragment>
      <button className={className || "btn btn-primary btn-sm"} onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />{T("เพิ่มเหตุการณ์", "Add Event")}
      </button>
      <AddEventModal open={open} onClose={() => setOpen(false)} lang={lang}
        addEvent={addEvent} showToast={showToast} />
    </React.Fragment>
  );
}

Object.assign(window, {
  useEventsUpdater, addEventToSupabase, loadEventsFromSupabase, queryEventsArchive,
  AddEventModal, AddEventButton, REGION_PRESETS,
  geocodeText, MDA_GEO_REGIONS, extractVesselsFromNews, extractNewsPointsFromNews,
  extractEventsFromNews, mergeEvents,
});
