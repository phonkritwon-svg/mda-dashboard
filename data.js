/* ============================================================
   MDA data — GLOBAL edition  → window.MDA_DATA
   Positions are real-world {lat, lon}; projected on a world map.
   News items reference REAL outlets + article URLs, summarized in Thai.
   (Open-source reporting, compiled for situational awareness.)
   ============================================================ */
window.MDA_DATA = (function () {

  const sources = {
    AIS:  { name: "MarineTraffic AIS", tag: "AIS",    color: "#4d9bf0" },
    NW:   { name: "Newsweek / Maxar",  tag: "SAT",    color: "#b07cf0" },
    GC:   { name: "gCaptain",          tag: "NEWS",   color: "#46c976" },
    ME:   { name: "The Maritime Executive", tag: "NEWS", color: "#3fae6a" },
    ST:   { name: "Seatrade Maritime", tag: "NEWS",   color: "#39a3a3" },
    DIP:  { name: "The Diplomat",      tag: "NEWS",   color: "#5fb0c9" },
    RIV:  { name: "Riviera Maritime",  tag: "DATA",   color: "#f0884d" },
    BAS:  { name: "Bulletin of Atomic Scientists", tag: "NEWS", color: "#4d9bf0" },
    AJ:   { name: "Al Jazeera",        tag: "NEWS",   color: "#49c0c0" },
    MARAD:{ name: "US MARAD / NAVCENT", tag: "GOV",   color: "#e3b341" },
    UKMTO:{ name: "UKMTO",             tag: "GOV",    color: "#e3b341" },
    LL:   { name: "Lloyd's List Intel", tag: "DATA",  color: "#f0884d" },

    // ---- แหล่งข่าว live จาก cron (api/cron-news.py) ----
    GCAP: { name: "gCaptain",               tag: "NEWS", color: "#46c976" },
    S4S:  { name: "Safety4Sea",             tag: "NEWS", color: "#39a3a3" },
    SPL:  { name: "Splash247",              tag: "NEWS", color: "#5fb0c9" },
    MAREX:{ name: "The Maritime Executive", tag: "NEWS", color: "#3fae6a" },
    MLINK:{ name: "MarineLink",             tag: "NEWS", color: "#39a3a3" },
    NVT:  { name: "Naval Today",            tag: "NAVY", color: "#e3b341" },
    USNI: { name: "USNI News",              tag: "NAVY", color: "#e3b341" },
    NAVN: { name: "Naval News",             tag: "NAVY", color: "#e3b341" },
    AMTI: { name: "CSIS AMTI",              tag: "SAT",  color: "#b07cf0" },
    GFW:  { name: "Global Fishing Watch",   tag: "DATA", color: "#f0884d" },
  };

  // ---- ภัยคุกคามทางทะเล 9 ด้าน ของ ศรชล. (Thai-MECC) ----
  // ใช้จัดหมวดข่าวอัตโนมัติจากคำสำคัญ (ไทย+อังกฤษ) ในหัวข้อ/สรุป
  const threatDomains = [
    { key:"SAR",      icon:"life-ring", color:"#46c976",
      th:"ค้นหา-ช่วยเหลือผู้ประสบภัย (SAR)", en:"Search & Rescue (SAR)",
      re:/\bsar\b|search and rescue|rescue|distress|mayday|capsiz|sink|sank|sunk|overboard|adrift|lifeboat|missing (?:crew|sailor|fisher|boat|vessel)|ค้นหา|กู้ภัย|ช่วยเหลือผู้ประสบภัย|ผู้ประสบภัย|อับปาง|เรือล่ม|เรือจม|พลิกคว่ำ|สูญหาย|ลอยคอ/i },
    { key:"IUU",      icon:"fish", color:"#33b8c8",
      th:"ประมงผิดกฎหมาย (IUU)", en:"IUU Fishing",
      re:/\biuu\b|illegal,?\s*unreported|illegal fishing|unlicensed fishing|overfish|trawler|fishing vessel|fishing fleet|fishing boat|poach|ประมงผิดกฎหมาย|ทำประมง|เรือประมง|ลอบจับปลา|ลักลอบจับสัตว์น้ำ/i },
    { key:"HUMAN",    icon:"users", color:"#e0a020",
      th:"ค้ามนุษย์/ลักลอบเข้าเมือง", en:"Human Trafficking & Smuggling",
      re:/human traffick|people smuggl|migrant|refugee|stowaway|forced labou?r|rohingya|ค้ามนุษย์|ผู้อพยพ|ผู้ลี้ภัย|ลักลอบเข้าเมือง|แรงงานบังคับ|โรฮิงญา|หลบหนีเข้าเมือง/i },
    { key:"DRUG",     icon:"alert-triangle", color:"#d9534f",
      th:"ยาเสพติด/อาวุธ/ของผิดกฎหมาย", en:"Drug, Arms & Contraband",
      re:/\bdrug|narcotic|cocaine|heroin|methamphetamine|cannabis|contraband|smuggl|arms shipment|weapons? seiz|gun(?:s|-)?running|ยาเสพติด|ลักลอบขน|ของผิดกฎหมาย|อาวุธสงคราม|ของเถื่อน|ยึด(?:ยา|ของกลาง)/i },
    { key:"ENV",      icon:"leaf", color:"#3aa66a",
      th:"ทรัพยากร-สิ่งแวดล้อมทางทะเล", en:"Marine Environment",
      re:/oil spill|pollution|polluted|coral|marine life|ecosystem|dumping|discharge|whale|dolphin|turtle|mangrove|seagrass|สิ่งแวดล้อม|น้ำมันรั่ว|มลพิษ|ปะการัง|ทรัพยากรทางทะเล|ระบบนิเวศ|สัตว์ทะเล|ป่าชายเลน/i },
    { key:"DISASTER", icon:"cloud", color:"#5fb0c9",
      th:"ภัยพิบัติทางธรรมชาติ", en:"Natural Disaster",
      re:/tsunami|typhoon|cyclone|hurricane|storm surge|\bstorm\b|flood|earthquake|severe weather|gale|monsoon|high waves?|ภัยพิบัติ|สึนามิ|พายุ|น้ำท่วม|แผ่นดินไหว|มรสุม|คลื่นสูง|คลื่นลมแรง/i },
    { key:"PIRACY",   icon:"crosshair", color:"#c9542a",
      th:"โจรสลัด/ปล้นเรือ", en:"Piracy & Armed Robbery",
      re:/piracy|pirate|armed robbery|hijack|boarded|boarding|kidnap|ransom|โจรสลัด|ปล้นเรือ|จี้เรือ|ปล้นสะดม|ขึ้นปล้น/i },
    { key:"TERROR",   icon:"shield", color:"#e0533b",
      th:"ก่อการร้ายทางทะเล", en:"Maritime Terrorism",
      re:/terror|militant|insurgent|\bied\b|limpet mine|\bbomb|explosi|houthi|drone (?:attack|strike)|missile (?:attack|strike|hit)|struck by|attack(?:ed)? (?:on |a )?(?:ship|vessel|tanker)|ก่อการร้าย|ผู้ก่อการ|วินาศกรรม|ระเบิด|ฮูตี|โจมตีเรือ|ลอบโจมตี/i },
    { key:"WMD",      icon:"radiation", color:"#b07cf0",
      th:"WMD/สินค้าสองวัตถุประสงค์", en:"WMD & Dual-use Goods",
      re:/\bwmd\b|nuclear|chemical weapon|biological weapon|dual-use|proliferation|sanction(?:s)? (?:evasion|breach|busting)|ballistic|enrichment|centrifuge|อาวุธนิวเคลียร์|อาวุธเคมี|อาวุธชีวภาพ|สองวัตถุประสงค์|ขีปนาวุธ|คว่ำบาตร|อาวุธทำลายล้างสูง/i },
  ];

  // คืนค่า array ของ key ภัยคุกคามที่ข่าวชิ้นนี้เข้าข่าย (อาจมีหลายด้าน)
  function _hay(v){ return typeof v === "string" ? v : (v ? ((v.en||"") + " " + (v.th||"")) : ""); }
  function classifyThreats(n){
    const text = _hay(n.raw) + "  " + _hay(n.ai) + "  " + (n.outlet || "");
    return threatDomains.filter(d => d.re.test(text)).map(d => d.key);
  }
  // เผยแพร่ให้ทุกสคริปต์เรียกใช้ได้
  window.MDA_THREAT_DOMAINS = threatDomains;
  window.classifyThreats   = classifyThreats;

  // ---- vessels ----
  // ลบเรือ dummy ทั้งหมดแล้ว — แผนที่แสดงเฉพาะเหตุการณ์จากฐานข้อมูล (events)
  // และจุดช่องแคบอ้างอิง (chokepoints) เท่านั้น
  const vessels = [];

  // ---- events / incidents ----
  // เหตุการณ์ทั้งหมดมาจาก Supabase (cron สร้างอัตโนมัติจากข่าวภัยสูง + ฟอร์มเพิ่มเอง)
  // โหลด/เขียนผ่าน events-feed.jsx — dummy เดิมถูกลบออกแล้ว
  const events = [];

  // ---- OSINT news feed (real outlets, summarized in Thai) ----
  const news = [
    {
      id:"N-3301", srcKey:"GC", outlet:"gCaptain", time:"08:55", ago:{th:"45 นาที",en:"45 min"},
      reliability:"A", credibility:4, linkedInc:"INC-3041",
      url:"https://gcaptain.com/houthis-signal-renewed-red-sea-shipping-attacks-after-u-s-israeli-strikes-on-iran/",
      raw:{ th:"กลุ่มฮูตีส่งสัญญาณกลับมาโจมตีเรือในทะเลแดง หลังการโจมตีอิหร่านของสหรัฐฯ-อิสราเอล",
            en:"Houthis signal renewed Red Sea shipping attacks after U.S.–Israeli strikes on Iran" },
      ai:{ th:"ปิดฉากช่วงสงบราว 3 เดือนครึ่ง · UKMTO ออกประกาศเตือน · BIMCO ชี้เรือเชื่อมโยงสหรัฐฯ/อิสราเอลเสี่ยงสูง เบี้ยประกันภัยสงครามจ่อพุ่ง — สอดคล้องเหตุ INC-3041",
           en:"Ends ~3.5-month lull · UKMTO advisory issued · BIMCO flags US/Israel-linked ships as high-risk, war-risk premiums set to spike — supports INC-3041." },
      verdict:"confirmed",
    },
    {
      id:"N-3298", srcKey:"ME", outlet:"The Maritime Executive", time:"07:30", ago:{th:"2 ชม.",en:"2 h"},
      reliability:"A", credibility:5, linkedInc:"INC-3038",
      url:"https://maritime-executive.com/article/china-and-philippines-rush-to-save-seafarers-after-k-line-bulker-sinks",
      raw:{ th:"จีนและฟิลิปปินส์เร่งช่วยลูกเรือหลังเรือเทกองธงสิงคโปร์อับปางในทะเลจีนใต้",
            en:"China and Philippines rush to save seafarers after Singapore bulker sinks" },
      ai:{ th:"Devon Bay พลิกคว่ำใกล้สการ์โบโรห์ · เสียชีวิต 2 กู้ได้ 17 สูญหาย 4 · ทั้งสองชาติส่งเรือ-อากาศยานในพื้นที่พิพาทอ่อนไหว — ตรง INC-3038",
           en:"Devon Bay capsized near Scarborough · 2 dead, 17 rescued, 4 missing · both states sent assets in sensitive disputed waters — matches INC-3038." },
      verdict:"confirmed",
    },
    {
      id:"N-3294", srcKey:"ST", outlet:"Seatrade Maritime", time:"06:10", ago:{th:"3 ชม.",en:"3 h"},
      reliability:"A", credibility:4, linkedInc:"INC-3035",
      url:"https://www.seatrade-maritime.com/security/shadow-fleet-attacks-widen-maritime-risks-around-russia",
      raw:{ th:"การโจมตีกองเรือเงาขยายความเสี่ยงทางทะเลรอบรัสเซีย — ทะเลดำและบอลติก",
            en:"Shadow fleet attacks widen maritime risks around Russia — Black & Baltic Seas" },
      ai:{ th:"ยูเครนโจมตีเรือบรรทุกน้ำมันใกล้โนโวรอสซีสค์ · เพิ่มความเสี่ยงทั่วโลกพร้อมฮอร์มุซและอ่าวเอเดน — เชื่อมโยง INC-3035 / INC-3026 / INC-3014",
           en:"Ukraine struck tankers near Novorossiysk · compounds global risk with Hormuz and Gulf of Aden — links INC-3035 / INC-3026 / INC-3014." },
      verdict:"corroborating",
    },
    {
      id:"N-3290", srcKey:"BAS", outlet:"Bulletin of the Atomic Scientists", time:"Feb 13", ago:{th:"คดีดำเนินอยู่",en:"ongoing"},
      reliability:"B", credibility:4, linkedInc:"INC-3030",
      url:"https://thebulletin.org/2026/02/seabed-zero-baltic-sabotage-and-the-global-risks-to-undersea-infrastructure/",
      raw:{ th:"การก่อวินาศกรรมใต้ทะเลบอลติกและความเสี่ยงต่อโครงสร้างพื้นฐานใต้ทะเลทั่วโลก",
            en:"Baltic seabed sabotage and the global risks to undersea infrastructure" },
      ai:{ th:"ฟินแลนด์ควบคุมเรือ Fitburg ปมสายเคเบิล · ชุดเหตุการณ์เชื่อมโยงกองเรือเงา การพิสูจน์ผู้กระทำผิดยาก — บริบทของ INC-3030",
           en:"Finland seized the Fitburg over a cable break · part of a ghost-fleet-linked series, attribution hard — context for INC-3030." },
      verdict:"corroborating",
    },
    {
      id:"N-3286", srcKey:"DIP", outlet:"The Diplomat", time:"Feb 20", ago:{th:"บทวิเคราะห์",en:"analysis"},
      reliability:"B", credibility:4, linkedInc:"INC-3019",
      url:"https://thediplomat.com/2026/02/red-lines-and-the-reshaping-of-asias-maritime-order",
      raw:{ th:"เส้นแดงและการจัดระเบียบทางทะเลของเอเชียใหม่ — นาตูนา, ญี่ปุ่นเพิ่มลาดตระเวน",
            en:"Red lines and the reshaping of Asia's maritime order — Natuna, Japan patrols" },
      ai:{ th:"บาคัมลาขับไล่เรือยามฝั่งจีนปมการสำรวจ · ญี่ปุ่นขยายเฝ้าระวังทางอากาศ 24 ชม. — สนับสนุน INC-3019 และบริบทเกรย์โซน",
           en:"Bakamla expelled a China CG vessel over a survey · Japan expanded 24h aerial watch — supports INC-3019 and grey-zone context." },
      verdict:"corroborating",
    },
    {
      id:"N-3281", srcKey:"MARAD", outlet:"US MARAD / NAVCENT", time:"Mar 26", ago:{th:"ประกาศ",en:"advisory"},
      reliability:"A", credibility:5, linkedInc:"INC-3041",
      url:"https://www.maritime.dot.gov/msci/2026-006-red-sea-bab-el-mandeb-strait-gulf-aden-arabian-sea-and-somali-basin-houthi-attacks",
      raw:{ th:"ประกาศเตือนความปลอดภัยทางทะเล: ทะเลแดง ช่องแคบบับเอลมันเดบ อ่าวเอเดน — ภัยจากฮูตี",
            en:"MSCI advisory: Red Sea, Bab el-Mandeb, Gulf of Aden — Houthi threat" },
      ai:{ th:"แหล่งทางการ · แนะนำเรือสหรัฐฯ ปรับเข็ม/ความเร็ว ระวัง AIS และประสาน NAVCENT NCAGS ตลอด 24 ชม. — ยืนยันมาตรการของ INC-3041",
           en:"Official source · advises US ships to vary course/speed, manage AIS, and coordinate with NAVCENT NCAGS 24/7 — confirms posture for INC-3041." },
      verdict:"confirmed",
    },
    {
      id:"N-3275", srcKey:"NW", outlet:"Newsweek / Maxar", time:"Aug 28", ago:{th:"ภาพดาวเทียม",en:"satellite"},
      reliability:"B", credibility:4, linkedInc:"INC-3038",
      url:"https://www.newsweek.com/satellite-photos-show-chinese-ship-badly-damaged-south-china-sea-crash-2120908",
      raw:{ th:"ภาพถ่ายดาวเทียมเผยเรือยามฝั่งจีนเสียหายหนักจากการชนในทะเลจีนใต้",
            en:"Satellite photos show Chinese ship badly damaged in South China Sea crash" },
      ai:{ th:"ภาพ Maxar ยืนยันเรือ CCG-3104 หัวเรือเสียหายหลังชนเรือพิฆาตขณะไล่เรือฟิลิปปินส์ — บริบทความตึงเครียดสการ์โบโรห์ (INC-3038)",
           en:"Maxar imagery confirms CCG-3104's bow damage after colliding with a destroyer while chasing a Philippine boat — Scarborough tension context (INC-3038)." },
      verdict:"partial",
    },
    {
      id:"N-3270", srcKey:"AJ", outlet:"Al Jazeera", time:"Jan 23", ago:{th:"รายงานข่าว",en:"report"},
      reliability:"B", credibility:4, linkedInc:"INC-3038",
      url:"https://www.aljazeera.com/news/2026/1/23/cargo-ship-capsizes-in-disputed-area-of-south-china-sea",
      raw:{ th:"เรือสินค้าพลิกคว่ำในพื้นที่พิพาททะเลจีนใต้ ลูกเรือฟิลิปปินส์ 21 คน",
            en:"Cargo ship capsizes in disputed area of South China Sea; 21 Filipino crew" },
      ai:{ th:"ยืนยันจำนวนลูกเรือและพื้นที่ใกล้สการ์โบโรห์ที่จีน-ฟิลิปปินส์อ้างสิทธิ์ทับซ้อน — สอดคล้องรายงานของ INC-3038",
           en:"Confirms crew count and location near contested Scarborough Shoal — consistent with INC-3038." },
      verdict:"corroborating",
    },
    {
      id:"N-3262", srcKey:"RIV", outlet:"Riviera Maritime", time:"5 d", ago:{th:"5 วัน",en:"5 d"},
      reliability:"B", credibility:3, linkedInc:"INC-3008",
      url:"https://www.rivieramm.com/news-content-hub/news-content-hub/2026-maritime-threats-three-seas-dominate-incidents-salvage-potential-87142",
      raw:{ th:"ภัยทางทะเลปี 2026: สามทะเลเสี่ยงสูง (ดำ แดง บอลติก) และจุดเสี่ยงแคริบเบียน-ทะเลจีนใต้",
            en:"2026 maritime threats: three seas dominate, plus Caribbean & South China Sea" },
      ai:{ th:"บทวิเคราะห์ความเสี่ยงเชิงคาดการณ์ · ระบุแคริบเบียนตอนใต้และทะเลจีนใต้เป็นจุดเสี่ยงเพิ่มเติม — บริบทของ INC-3008",
           en:"Forward-looking risk analysis · names southern Caribbean and South China Sea as added hotspots — context for INC-3008." },
      verdict:"context",
    },
  ];

  // ---- live stat tiles (global) ----
  const stats = {
    vesselsTracked: 18432,
    vesselsDelta: +312,
    activeIncidents: 8,
    darkVessels: 23,
    osintToday: 642,
    osintDelta: +58,
    aiProcessed: 588,
    coverage: 87,
  };

  // ---- OSINT source mix ----
  const sourceMix = [
    { key:"AIS", label:"AIS / MarineTraffic", count: 142 },
    { key:"GC",  label:"Maritime news", count: 64 },
    { key:"NW",  label:"Satellite / SAR", count: 39 },
    { key:"UKMTO", label:"Gov advisories", count: 33 },
    { key:"DIP", label:"Analysis / think-tank", count: 21 },
    { key:"LL",  label:"Lloyd's List data", count: 18 },
  ];

  // ---- incident category breakdown (7d) ----
  const catMix = [
    { key:"ATTACK",  label:{th:"โจมตีเรือพาณิชย์",en:"Attacks on shipping"}, count: 14, color:"#f6553f" },
    { key:"DARK",    label:{th:"กองเรือเงา/ปิดสัญญาณ",en:"Shadow / dark fleet"}, count: 12, color:"#b07cf0" },
    { key:"GREY",    label:{th:"เกรย์โซน/เผชิญหน้า",en:"Grey-zone clashes"}, count: 9, color:"#e3b341" },
    { key:"CABLE",   label:{th:"สายเคเบิลใต้ทะเล",en:"Subsea cable"}, count: 6, color:"#4d9bf0" },
    { key:"PIRACY",  label:{th:"โจรสลัด",en:"Piracy"}, count: 5, color:"#f0884d" },
    { key:"SAR",     label:{th:"ค้นหา-ช่วยเหลือ",en:"SAR"}, count: 4, color:"#46c976" },
  ];

  // ---- 24h activity sparkline ----
  const activity24h = [14,11,9,12,16,18,15,19,22,24,28,21,19,26,31,27,23,29,34,28,22,18,15,12];

  // ---- daily brief ----
  const brief = {
    date: { th:"10 มิถุนายน 2569", en:"10 June 2026" },
    classification: "OFFICIAL USE — OSINT",
    bluf:{
      th:"ภาพรวมความมั่นคงทางทะเลโลกอยู่ระดับ 'เฝ้าระวังสูง' (ELEVATED) จากสามจุดร้อนหลัก: (1) ฮูตีส่งสัญญาณรื้อฟื้นการโจมตีในทะเลแดงหลังสถานการณ์อิหร่าน (2) การโจมตีกองเรือเงาในทะเลดำ-บอลติกและการตัดสายเคเบิลใต้ทะเล (3) ความตึงเครียดเกรย์โซนในทะเลจีนใต้รวมเหตุเรืออับปางใกล้สการ์โบโรห์",
      en:"Global maritime posture is ELEVATED, driven by three hotspots: (1) Houthi signals to resume Red Sea attacks amid the Iran situation; (2) shadow-fleet strikes in the Black/Baltic Seas and undersea cable damage; (3) South China Sea grey-zone tension including the Scarborough Shoal sinking."
    },
    highlights:[
      { sev:"critical", inc:"INC-3041",
        th:"ฮูตีส่งสัญญาณกลับมาโจมตีเรือในทะเลแดง — UKMTO เตือน, เบี้ยประกันภัยสงครามจ่อพุ่ง",
        en:"Houthis signal renewed Red Sea attacks — UKMTO advisory, war-risk premiums set to spike." },
      { sev:"high", inc:"INC-3038",
        th:"เรือเทกองธงสิงคโปร์อับปางใกล้สการ์โบโรห์ มีผู้เสียชีวิต — ปฏิบัติการ SAR ร่วมจีน-ฟิลิปปินส์",
        en:"Singapore bulker sinks near Scarborough with fatalities — joint China–Philippines SAR." },
      { sev:"high", inc:"INC-3035",
        th:"ยูเครนโจมตีเรือบรรทุกน้ำมันกองเรือเงาใกล้โนโวรอสซีสค์ในทะเลดำ",
        en:"Ukraine strikes shadow-fleet tankers near Novorossiysk in the Black Sea." },
      { sev:"high", inc:"INC-3030",
        th:"ฟินแลนด์ควบคุมเรือกองเรือเงาปมสายเคเบิลใต้ทะเลบอลติกเสียหาย",
        en:"Finland seizes a ghost-fleet vessel over Baltic undersea cable damage." },
    ],
    outlook:{
      th:"คาดการณ์ 24 ชม.ข้างหน้า: ความเสี่ยงในทะเลแดง/ช่องแคบฮอร์มุซยังสูงและขึ้นกับพลวัตอิหร่าน · กองเรือเงาและการก่อกวนโครงสร้างใต้ทะเลในยุโรปมีแนวโน้มต่อเนื่อง · ทะเลจีนใต้ยังตึงเครียดเชิงเกรย์โซน แนะคงระดับเฝ้าระวังสูง เพิ่มการยืนยันด้วยภาพถ่ายดาวเทียมในจุดร้อน และประสานเครือข่ายพันธมิตร (CTF-153, EUNAVFOR Aspides, NATO Baltic Sentry)",
      en:"Next 24h: Red Sea / Hormuz risk stays high and Iran-dependent · shadow-fleet and undersea-infrastructure interference in Europe likely to persist · South China Sea grey-zone tension continues. Recommend sustaining ELEVATED posture, increasing satellite confirmation over hotspots, and coordinating with partner task forces (CTF-153, EUNAVFOR Aspides, NATO Baltic Sentry)."
    },
    metrics:[
      { k:{th:"เหตุการณ์ใหม่",en:"New incidents"}, v:"8" },
      { k:{th:"ปิดเหตุแล้ว",en:"Resolved"}, v:"1" },
      { k:{th:"เรือเฝ้าระวัง",en:"Vessels of interest"}, v:"8" },
      { k:{th:"ข่าว OSINT ประมวลผล",en:"OSINT processed"}, v:"588" },
    ],
  };

  // ---- generic fallback incident timeline ----
  const incTimeline = [
    { time:"T-6h", lvl:"info", th:"ระบบรวบรวมสัญญาณ OSINT/AIS รอบปกติครอบคลุมพื้นที่", en:"Routine OSINT/AIS collection covers the area." },
    { time:"T-3h", lvl:"info", th:"อัลกอริทึมตรวจจับความผิดปกติของพฤติกรรมเรือ", en:"Anomaly-detection flags unusual vessel behaviour." },
    { time:"T-1h", lvl:"warn", th:"แหล่งข่าวเปิดหลายแหล่งเริ่มสอดคล้องกัน", en:"Multiple open sources begin to corroborate." },
    { time:"T-0", lvl:"crit", th:"AI รวมข่าวและยกระดับเป็นเหตุการณ์เฝ้าระวัง", en:"AI fuses reporting and escalates to a tracked incident." },
  ];

  const recommendations = [
    { th:"ยืนยันด้วยภาพถ่ายดาวเทียม SAR/EO ในพื้นที่เกิดเหตุ", en:"Confirm with SAR/EO satellite imagery over the area." },
    { th:"แจ้งเตือนเรือพาณิชย์ในเส้นทางและประสาน UKMTO/NCAGS", en:"Alert commercial traffic on route; coordinate with UKMTO/NCAGS." },
    { th:"เฝ้าระวังรูปแบบ AIS ที่ดับหรือปลอมแปลง", en:"Monitor for AIS gaps or spoofing patterns." },
    { th:"ประสานเครือข่ายพันธมิตร/กองเรือเฉพาะกิจในพื้นที่", en:"Coordinate with partner task forces operating in-theatre." },
  ];

  return { sources, vessels, events, news, stats, sourceMix, catMix, activity24h, brief, incTimeline, recommendations, threatDomains };
})();
