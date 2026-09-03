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
  { re: /strait of hormuz|hormuz|fujairah|ช่องแคบฮอร์มุซ/i,                   th: "ช่องแคบฮอร์มุซ",            en: "Strait of Hormuz",        lat: 26.5, lon: 56.3 },
  /* อ่าวเปอร์เซียแยกจากช่องแคบฮอร์มุซ — เดิมรวมเป็นกฎเดียวกัน ข่าวเรื่องอ่าว
     ทั้งอ่าวจึงถูกปักที่ปากช่องแคบซึ่งอยู่คนละมุมห่างกันหลายร้อยกิโลเมตร */
  { re: /persian gulf|arabian gulf|kharg|saudi|kuwait|bahrain|qatar|\buae\b|emirates|dubai|abu dhabi|อ่าวเปอร์เซีย/i,                           th: "อ่าวเปอร์เซีย",             en: "Persian Gulf",            lat: 26.5, lon: 52.0 },
  { re: /gulf of aden|\baden\b|อ่าวเอเดน/i,                              th: "อ่าวเอเดน",                 en: "Gulf of Aden",            lat: 12.5, lon: 47.0 },
  { re: /south china sea|scarborough|spratly|paracel|second thomas|taiwan strait|ทะเลจีนใต้|สการ์โบโรห์|พารา?เซล|สปร(?:าต|ตลี)|ทะเลจีน/i, th: "ทะเลจีนใต้", en: "South China Sea", lat: 15.0, lon: 117.0 },
  { re: /strait of malacca|malacca|singapore strait|ช่องแคบมะละกา|มะละกา|สิงค์โปร์|singapor/i,         th: "ช่องแคบมะละกา",             en: "Strait of Malacca",       lat: 2.5,  lon: 101.0 },
  /* ── เพื่อนบ้าน: กัมพูชา / เมียนมา / มาเลเซีย ──────────────────
     ตารางฝั่งเซิร์ฟเวอร์ (api/cron-news.py) มีสามกฎนี้มาตลอด แต่ฝั่งหน้าเว็บ
     ไม่มี ข่าวอย่าง "Port of Sihanoukville" จึงไม่ขึ้นหมุดเลยบนแผนที่
     ทั้งที่เหตุการณ์จาก cron ชุดเดียวกันขึ้นได้ปกติ */
  { re: /cambodia|cambodian|khmer|sihanoukville|sihanouk|kampong som|ream|kampot|กัมพูชา|เขมร|สีหนุ/i,
                                                               th: "ชายฝั่งกัมพูชา / อ่าวไทย",  en: "Cambodia Coast",          lat: 10.6,  lon: 103.5 },
  { re: /myanmar|burma|burmese|rakhine|arakan|sittwe|kyauk ?phyu|kyaukpyu|coco island|great coco|mergui|myeik|tanintharyi|yangon|naypyidaw|irrawaddy|rohingya|เมียนมา|พม่า|โรฮีนจา/i,
                                                               th: "ชายฝั่งเมียนมา / อันดามัน–เบงกอล", en: "Myanmar Coast",    lat: 15.5,  lon: 94.5 },
  { re: /malaysia|malaysian|melaka|johor|sabah|sarawak|kota kinabalu|labuan|lumut|langkawi|penang|port klang|kuala lumpur|putrajaya|มาเลเซีย/i,
                                                               th: "มาเลเซีย / มะละกา–บอร์เนียว", en: "Malaysia Coast",       lat: 4.0,   lon: 109.5 },

  /* ── ชายแดนทะเลไทย–กัมพูชา (ต้องตรวจก่อน "อ่าวไทย" ที่กว้างกว่า) ── */
  { re: /\btrat\b|ตราด/i,                                      th: "ตราด",                      en: "Trat",                    lat: 12.0,  lon: 102.5 },
  { re: /overlapping claims|\boca\b|พื้นที่อ้างสิทธิทับซ้อน|พื้นที่ทับซ้อน/i, th: "พื้นที่อ้างสิทธิทับซ้อน (อ่าวไทย)", en: "Gulf of Thailand OCA", lat: 8.0, lon: 102.5 },

  /* ── จุดเกิดเหตุในไทย: ท่าเรือ · ฐานทัพเรือ · เกาะ · หาด · ปากน้ำ ──────
     ละเอียดกว่าระดับจังหวัดหนึ่งขั้น และนี่คือขั้นที่ข่าวทางน้ำต้องการจริง ๆ
     เหตุทางทะเลเกิดที่ "ท่าเรือ/เกาะ/ปากน้ำ" ไม่ได้เกิดที่ศาลากลางจังหวัด
     ปักที่ใจกลางจังหวัดจึงเพี้ยนได้หลายสิบกิโลเมตร และเพี้ยนลงบนบกด้วย
     ตัวอย่างที่วัดจริง: "จมน้ำกลางทะเลปากอ่าวแหลมฉบัง" เคยลงที่ตัวเมืองชลบุรี
     ห่างจากปากอ่าวจริงราว 30 กม. · "เกาะสมุย" เคยลงที่ตัวเมืองสุราษฎร์ธานี
     ซึ่งอยู่คนละฝั่งอ่าว ห่างราว 80 กม.

     kind: "point" เขียนติดมากับกฎเลย ไม่ต้องไปเติมชื่อใน GEO_SPECIFIC อีกที่
     (ลืมเติมเมื่อไร กฎนั้นจะกลายเป็น "country" เงียบ ๆ — ดูคอมเมนต์ที่ geoKind) */

  /* ท่าเรือพาณิชย์ / ฐานทัพเรือ */
  { kind: "point", re: /laem ?chabang|แหลมฉบัง/i,                      th: "ท่าเรือแหลมฉบัง",      en: "Laem Chabang Port",   lat: 13.08, lon: 100.88 },
  { kind: "point", re: /khlong ?toei|คลองเตย|ท่าเรือกรุงเทพ/i,          th: "ท่าเรือกรุงเทพ (คลองเตย)", en: "Bangkok Port",     lat: 13.70, lon: 100.58 },
  { kind: "point", re: /map ?ta ?phut|มาบตาพุด/i,                       th: "มาบตาพุด",             en: "Map Ta Phut",         lat: 12.67, lon: 101.15 },
  { kind: "point", re: /sattahip|สัตหีบ|ฐานทัพเรือสัตหีบ|อู่ตะเภา|u[- ]?tapao/i, th: "สัตหีบ",       en: "Sattahip",            lat: 12.63, lon: 100.90 },
  { kind: "point", re: /ท่าเรือสงขลา|songkhla ?port/i,                  th: "ท่าเรือสงขลา",         en: "Songkhla Port",       lat: 7.21,  lon: 100.59 },
  { kind: "point", re: /pak ?bara|ปากบารา/i,                            th: "ปากบารา (สตูล)",       en: "Pak Bara",            lat: 6.86,  lon: 99.72 },
  { kind: "point", re: /laem ?ngop|แหลมงอบ/i,                           th: "แหลมงอบ (ตราด)",       en: "Laem Ngop",           lat: 12.18, lon: 102.39 },
  { kind: "point", re: /khlong ?yai|คลองใหญ่|หาดเล็ก/i,                 th: "คลองใหญ่ (ตราด)",      en: "Khlong Yai",          lat: 11.78, lon: 102.88 },
  { kind: "point", re: /ban ?phe|บ้านเพ/i,                              th: "บ้านเพ (ระยอง)",       en: "Ban Phe",             lat: 12.63, lon: 101.44 },
  { kind: "point", re: /don ?sak|ดอนสัก/i,                              th: "ดอนสัก (สุราษฎร์ธานี)", en: "Don Sak",            lat: 9.31,  lon: 99.69 },
  { kind: "point", re: /ท่าเรือระนอง|ranong ?port|เกาะสอง|kawthaung/i,  th: "ท่าเรือระนอง",         en: "Ranong Port",         lat: 9.94,  lon: 98.60 },
  { kind: "point", re: /ปากน้ำชุมพร|หลังสวน/i,                          th: "ปากน้ำชุมพร",          en: "Pak Nam Chumphon",    lat: 10.47, lon: 99.23 },

  /* เกาะ */
  { kind: "point", re: /ko ?kut|koh ?kood|เกาะกูด/i,                    th: "เกาะกูด",              en: "Ko Kut",              lat: 11.65, lon: 102.58 },
  { kind: "point", re: /koh ?kong|เกาะกง/i,                             th: "เกาะกง",               en: "Koh Kong",            lat: 11.60, lon: 103.00 },
  { kind: "point", re: /ko(?:h)? ?chang|เกาะช้าง/i,                     th: "เกาะช้าง (ตราด)",      en: "Ko Chang",            lat: 12.05, lon: 102.32 },
  { kind: "point", re: /ko(?:h)? ?samet|เกาะเสม็ด/i,                    th: "เกาะเสม็ด",            en: "Ko Samet",            lat: 12.57, lon: 101.45 },
  { kind: "point", re: /ko(?:h)? ?larn|เกาะล้าน/i,                      th: "เกาะล้าน",             en: "Ko Larn",             lat: 12.92, lon: 100.79 },
  { kind: "point", re: /ko(?:h)? ?sichang|เกาะสีชัง/i,                  th: "เกาะสีชัง",            en: "Ko Sichang",          lat: 13.16, lon: 100.81 },
  { kind: "point", re: /ko(?:h)? ?samui|เกาะสมุย|สมุย/i,                th: "เกาะสมุย",             en: "Ko Samui",            lat: 9.51,  lon: 100.01 },
  { kind: "point", re: /ko(?:h)? ?pha ?ngan|เกาะพะงัน/i,                th: "เกาะพะงัน",            en: "Ko Pha Ngan",         lat: 9.75,  lon: 100.03 },
  { kind: "point", re: /ko(?:h)? ?tao|เกาะเต่า/i,                       th: "เกาะเต่า",             en: "Ko Tao",              lat: 10.10, lon: 99.84 },
  { kind: "point", re: /phi ?phi|เกาะพีพี|พีพี/i,                       th: "เกาะพีพี",             en: "Ko Phi Phi",          lat: 7.74,  lon: 98.78 },
  { kind: "point", re: /ko(?:h)? ?lanta|เกาะลันตา/i,                    th: "เกาะลันตา",            en: "Ko Lanta",            lat: 7.55,  lon: 99.05 },
  { kind: "point", re: /tarutao|ตะรุเตา/i,                              th: "เกาะตะรุเตา",          en: "Ko Tarutao",          lat: 6.68,  lon: 99.65 },
  { kind: "point", re: /lipe|หลีเป๊ะ/i,                                 th: "เกาะหลีเป๊ะ",          en: "Ko Lipe",             lat: 6.49,  lon: 99.30 },
  { kind: "point", re: /similan|สิมิลัน/i,                              th: "หมู่เกาะสิมิลัน",      en: "Similan Islands",     lat: 8.65,  lon: 97.64 },
  { kind: "point", re: /surin ?islands|หมู่เกาะสุรินทร์/i,              th: "หมู่เกาะสุรินทร์",     en: "Surin Islands",       lat: 9.42,  lon: 97.87 },
  { kind: "point", re: /ko(?:h)? ?phayam|เกาะพยาม/i,                    th: "เกาะพยาม (ระนอง)",     en: "Ko Phayam",           lat: 9.75,  lon: 98.42 },

  /* หาด / อ่าว ที่ปรากฏในข่าวบ่อย */
  { kind: "point", re: /\bpattaya\b|พัทยา/i,                            th: "พัทยา",                en: "Pattaya",             lat: 12.93, lon: 100.88 },
  { kind: "point", re: /bang ?saen|บางแสน/i,                            th: "บางแสน",               en: "Bang Saen",           lat: 13.28, lon: 100.92 },
  { kind: "point", re: /hua ?hin|หัวหิน/i,                              th: "หัวหิน",               en: "Hua Hin",             lat: 12.57, lon: 99.96 },
  { kind: "point", re: /cha[- ]?am|ชะอำ/i,                              th: "ชะอำ",                 en: "Cha-am",              lat: 12.80, lon: 99.97 },
  { kind: "point", re: /patong|ป่าตอง/i,                                th: "หาดป่าตอง (ภูเก็ต)",   en: "Patong Beach",        lat: 7.89,  lon: 98.30 },
  { kind: "point", re: /ao ?manao|อ่าวมะนาว/i,                          th: "อ่าวมะนาว (ประจวบฯ)",  en: "Ao Manao",            lat: 11.77, lon: 99.82 },
  { kind: "point", re: /samae ?san|แสมสาร/i,                            th: "อ่าวแสมสาร (ชลบุรี)",  en: "Samae San",           lat: 12.60, lon: 100.95 },

  /* ปากน้ำ — เหตุเรือส่วนใหญ่เกิดตรงปากแม่น้ำ ไม่ใช่กลางอ่าว */
  { kind: "point", re: /ปากน้ำเจ้าพระยา|ปากน้ำสมุทรปราการ/i,           th: "ปากน้ำเจ้าพระยา",      en: "Chao Phraya Mouth",   lat: 13.55, lon: 100.59 },
  { kind: "point", re: /ปากน้ำแม่กลอง/i,                                th: "ปากน้ำแม่กลอง",        en: "Mae Klong Mouth",     lat: 13.38, lon: 100.00 },
  { kind: "point", re: /ปากน้ำท่าจีน/i,                                 th: "ปากน้ำท่าจีน",         en: "Tha Chin Mouth",      lat: 13.45, lon: 100.28 },
  { kind: "point", re: /ปากน้ำระยอง/i,                                  th: "ปากน้ำระยอง",          en: "Rayong River Mouth",  lat: 12.66, lon: 101.28 },
  { kind: "point", re: /ปากน้ำกระบี่/i,                                 th: "ปากน้ำกระบี่",         en: "Krabi River Mouth",   lat: 8.06,  lon: 98.92 },
  { kind: "point", re: /ปากพนัง/i,                                      th: "ปากพนัง (นครศรีฯ)",    en: "Pak Phanang",         lat: 8.35,  lon: 100.20 },
  { kind: "point", re: /ปากน้ำปราณ|ปราณบุรี/i,                          th: "ปากน้ำปราณบุรี",       en: "Pran Buri Mouth",     lat: 12.40, lon: 99.98 },

  /* ── จังหวัดในประเทศไทย ────────────────────────────────────────────
     วางไว้ "หลัง" ทะเลที่มีชื่อเฉพาะ แต่ "ก่อน" อ่าวไทย/อันดามันที่กว้าง
     ข่าวในประเทศจะได้ลงหมุดที่จังหวัด ไม่ใช่ลอยไปกลางอ่าว

     พิกัดเป็นระดับศาลากลางจังหวัด/ใจกลางจังหวัดโดยประมาณ (±ไม่กี่สิบ กม.)
     พอสำหรับปักหมุดข่าว แต่ไม่ใช่พิกัดจุดเกิดเหตุ — ห้ามใช้ในงานที่ต้องแม่น

     รายการนี้ยังไม่ครบ 77 จังหวัด เลือกเฉพาะจังหวัดชายแดน ชายฝั่ง
     และจังหวัดใหญ่ที่มักปรากฏในข่าวความมั่นคง เพิ่มได้โดยแทรกบรรทัดใหม่
     ให้อยู่เหนือกฎ "ประเทศไทย" ท้ายกลุ่ม                                 */

  /* ชายแดนใต้ */
  { re: /narathiwat|นราธิวาส|สุคิริน|ตากใบ|ระแงะ|เจาะไอร้อง/i,   th: "นราธิวาส",        en: "Narathiwat",       lat: 6.43,  lon: 101.82 },
  { re: /\bpattani\b|ปัตตานี|สายบุรี|หนองจิก/i,                  th: "ปัตตานี",          en: "Pattani",          lat: 6.87,  lon: 101.25 },
  { re: /\byala\b|ยะลา|เบตง|บันนังสตา/i,                         th: "ยะลา",             en: "Yala",             lat: 6.54,  lon: 101.28 },
  { re: /songkhla|สงขลา|หาดใหญ่|สะเดา|ทะเลสาบสงขลา/i,           th: "สงขลา",            en: "Songkhla",         lat: 7.20,  lon: 100.60 },
  { re: /\bsatun\b|สตูล/i,                                        th: "สตูล",             en: "Satun",            lat: 6.62,  lon: 100.07 },

  /* ชายแดนตะวันตก–เหนือ */
  { re: /\btak\b|จังหวัดตาก|แม่สอด|mae ?sot|ท่าสายลวด|แม่กุ/i,   th: "ตาก",              en: "Tak",              lat: 16.87, lon: 99.13 },
  { re: /mae ?hong ?son|แม่ฮ่องสอน/i,                             th: "แม่ฮ่องสอน",       en: "Mae Hong Son",     lat: 19.30, lon: 97.97 },
  { re: /chiang ?rai|เชียงราย|แม่สาย|เชียงแสน|เชียงของ/i,        th: "เชียงราย",         en: "Chiang Rai",       lat: 19.91, lon: 99.83 },
  { re: /chiang ?mai|เชียงใหม่/i,                                 th: "เชียงใหม่",        en: "Chiang Mai",       lat: 18.79, lon: 98.98 },
  { re: /kanchanaburi|กาญจนบุรี|สังขละบุรี|ด่านเจดีย์สามองค์/i,  th: "กาญจนบุรี",        en: "Kanchanaburi",     lat: 14.02, lon: 99.53 },
  { re: /\branong\b|ระนอง/i,                                      th: "ระนอง",            en: "Ranong",           lat: 9.96,  lon: 98.63 },

  /* ชายแดนอีสาน */
  { re: /nong ?khai|หนองคาย/i,                                    th: "หนองคาย",          en: "Nong Khai",        lat: 17.88, lon: 102.74 },
  { re: /nakhon ?phanom|นครพนม/i,                                 th: "นครพนม",           en: "Nakhon Phanom",    lat: 17.41, lon: 104.78 },
  { re: /mukdahan|มุกดาหาร/i,                                     th: "มุกดาหาร",         en: "Mukdahan",         lat: 16.54, lon: 104.72 },
  { re: /ubon ?ratchathani|อุบลราชธานี|ช่องเม็ก/i,               th: "อุบลราชธานี",      en: "Ubon Ratchathani", lat: 15.24, lon: 104.85 },
  { re: /sa ?kaeo|สระแก้ว|อรัญประเทศ|คลองลึก/i,                  th: "สระแก้ว",          en: "Sa Kaeo",          lat: 13.82, lon: 102.07 },

  /* ชายฝั่งตะวันออก */
  { re: /chanthaburi|จันทบุรี/i,                                  th: "จันทบุรี",         en: "Chanthaburi",      lat: 12.61, lon: 102.10 },
  { re: /\brayong\b|ระยอง|มาบตาพุด/i,                             th: "ระยอง",            en: "Rayong",           lat: 12.68, lon: 101.25 },
  { re: /chon ?buri|ชลบุรี|พัทยา|แหลมฉบัง|สัตหีบ|เกาะสีชัง/i,   th: "ชลบุรี",           en: "Chon Buri",        lat: 13.36, lon: 100.98 },

  /* ชายฝั่งอ่าวไทยตอนบน–ใต้ */
  { re: /samut ?prakan|สมุทรปราการ|บางปู/i,                       th: "สมุทรปราการ",      en: "Samut Prakan",     lat: 13.60, lon: 100.60 },
  { re: /samut ?sakhon|สมุทรสาคร|มหาชัย/i,                        th: "สมุทรสาคร",        en: "Samut Sakhon",     lat: 13.55, lon: 100.27 },
  { re: /samut ?songkhram|สมุทรสงคราม/i,                          th: "สมุทรสงคราม",      en: "Samut Songkhram",  lat: 13.41, lon: 100.00 },
  { re: /phetchaburi|เพชรบุรี|ชะอำ/i,                             th: "เพชรบุรี",         en: "Phetchaburi",      lat: 13.11, lon: 99.94 },
  { re: /prachuap|ประจวบคีรีขันธ์|หัวหิน|บางสะพาน/i,             th: "ประจวบคีรีขันธ์",  en: "Prachuap Khiri Khan", lat: 11.81, lon: 99.80 },
  { re: /\bchumphon\b|ชุมพร/i,                                    th: "ชุมพร",            en: "Chumphon",         lat: 10.49, lon: 99.18 },
  { re: /surat ?thani|สุราษฎร์ธานี|เกาะสมุย|เกาะพะงัน|เกาะเต่า/i, th: "สุราษฎร์ธานี",    en: "Surat Thani",      lat: 9.14,  lon: 99.33 },
  { re: /nakhon ?si ?thammarat|นครศรีธรรมราช|ขนอม/i,             th: "นครศรีธรรมราช",    en: "Nakhon Si Thammarat", lat: 8.43, lon: 99.96 },
  { re: /phatthalung|พัทลุง/i,                                    th: "พัทลุง",           en: "Phatthalung",      lat: 7.62,  lon: 100.08 },

  /* ชายฝั่งอันดามัน */
  { re: /\bphuket\b|ภูเก็ต/i,                                     th: "ภูเก็ต",           en: "Phuket",           lat: 7.88,  lon: 98.39 },
  { re: /\bkrabi\b|กระบี่/i,                                      th: "กระบี่",           en: "Krabi",            lat: 8.09,  lon: 98.91 },
  { re: /phang ?nga|พังงา|เขาหลัก/i,                              th: "พังงา",            en: "Phang Nga",        lat: 8.45,  lon: 98.53 },
  /* กัน "Nha Trang" (เวียดนาม) ออก — \btrang\b ตรงกับคำหลังของชื่อนั้นเต็ม ๆ
     ข่าวเหตุทางทะเลนอกฝั่งญาจางจะถูกปักลงตรัง ผิดไปคนละฝั่งคาบสมุทร ~900 กม. */
  { re: /(?<!nha[ -])\btrang\b|ตรัง/i,                            th: "ตรัง",             en: "Trang",            lat: 7.56,  lon: 99.61 },

  /* กรุงเทพฯ–ปริมณฑล–ภาคกลาง */
  { re: /bangkok|กรุงเทพ|กทม\.?|จอมทอง|หนองแขม|บางมด|พระราม 2|ดอนเมือง|สุวรรณภูมิ|suvarnabhumi/i,
                                                                   th: "กรุงเทพมหานคร",    en: "Bangkok",          lat: 13.75, lon: 100.52 },
  { re: /nonthaburi|นนทบุรี/i,                                    th: "นนทบุรี",          en: "Nonthaburi",       lat: 13.86, lon: 100.51 },
  { re: /pathum ?thani|ปทุมธานี/i,                                th: "ปทุมธานี",         en: "Pathum Thani",     lat: 14.02, lon: 100.53 },
  { re: /ayutthaya|อยุธยา|วังน้อย/i,                              th: "พระนครศรีอยุธยา",  en: "Ayutthaya",        lat: 14.35, lon: 100.58 },
  { re: /saraburi|สระบุรี|หนองโดน/i,                              th: "สระบุรี",          en: "Saraburi",         lat: 14.53, lon: 100.91 },
  { re: /nakhon ?sawan|นครสวรรค์|ตาคลี|หนองโพ/i,                 th: "นครสวรรค์",        en: "Nakhon Sawan",     lat: 15.70, lon: 100.14 },
  { re: /phitsanulok|พิษณุโลก|วังทอง|บางกระทุ่ม/i,               th: "พิษณุโลก",         en: "Phitsanulok",      lat: 16.82, lon: 100.26 },
  { re: /phichit|พิจิตร/i,                                        th: "พิจิตร",           en: "Phichit",          lat: 16.44, lon: 100.35 },
  { re: /phetchabun|เพชรบูรณ์/i,                                  th: "เพชรบูรณ์",        en: "Phetchabun",       lat: 16.42, lon: 101.16 },

  /* อีสานตอนใน */
  { re: /khon ?kaen|ขอนแก่น|ภูผาม่าน|ห้วยม่วง|แวงน้อย/i,         th: "ขอนแก่น",          en: "Khon Kaen",        lat: 16.44, lon: 102.83 },
  { re: /nakhon ?ratchasima|นครราชสีมา|โคราช/i,                   th: "นครราชสีมา",       en: "Nakhon Ratchasima", lat: 14.97, lon: 102.10 },
  { re: /udon ?thani|อุดรธานี/i,                                  th: "อุดรธานี",         en: "Udon Thani",       lat: 17.41, lon: 102.79 },
  { re: /chaiyaphum|ชัยภูมิ|บ้านเล่า/i,                           th: "ชัยภูมิ",          en: "Chaiyaphum",       lat: 15.81, lon: 102.03 },
  { re: /\bsurin\b|สุรินทร์/i,                                    th: "สุรินทร์",         en: "Surin",            lat: 14.88, lon: 103.49 },
  { re: /buri ?ram|บุรีรัมย์/i,                                   th: "บุรีรัมย์",        en: "Buri Ram",         lat: 14.99, lon: 103.10 },

  /* ── จังหวัดที่เหลือ (เติมให้ครบ 77) ────────────────────────────────
     เดิมมีแค่จังหวัดชายแดน/ชายฝั่ง ข่าวทางน้ำในแผ่นดิน เช่น "เรือล่มแม่น้ำน่าน
     ที่เวียงสา" จึงตกไปที่กฎท้ายสุด "ประเทศไทย" แล้วปักหมุดลงกรุงเทพฯ
     ห่างจากที่เกิดเหตุจริงราว 550 กม.

     ⚠ ชื่อจังหวัดที่เป็นคำทั่วไปหรือเป็นส่วนหน้าของคำอื่นต้องบังคับให้มี
       "จังหวัด/จ." นำหน้าเสมอ (กฎเดียวกับ components.jsx):
         เลย  → "ไม่ได้เลย"   น่าน → "น่านน้ำ"   แพร่ → "แพร่ระบาด" · "เผยแพร่"
       ชื่ออำเภอที่ไม่กำกวมใส่ตรง ๆ ได้ ใช้เป็นทางเข้าอีกทางของจังหวัดนั้น */

  /* เหนือ */
  { kind: "specific", re: /nan ?province|(?:จังหวัด|จ\.\s?)น่าน|เมืองน่าน|เวียงสา|ท่าวังผา|อ\.\s?ปัว/i,
                                                                  th: "น่าน",            en: "Nan",              lat: 18.78, lon: 100.78 },
  { kind: "specific", re: /\bphrae\b|(?:จังหวัด|จ\.\s?)แพร่|เมืองแพร่|อ\.\s?เด่นชัย|สูงเม่น/i,
                                                                  th: "แพร่",            en: "Phrae",            lat: 18.14, lon: 100.14 },
  { kind: "specific", re: /lampang|ลำปาง|เถิน|แม่เมาะ/i,           th: "ลำปาง",           en: "Lampang",          lat: 18.29, lon: 99.49 },
  { kind: "specific", re: /lamphun|ลำพูน|ป่าซาง/i,                 th: "ลำพูน",           en: "Lamphun",          lat: 18.58, lon: 99.01 },
  { kind: "specific", re: /phayao|พะเยา|เชียงคำ|ดอกคำใต้/i,        th: "พะเยา",           en: "Phayao",           lat: 19.17, lon: 99.90 },
  { kind: "specific", re: /uttaradit|อุตรดิตถ์|ท่าปลา|น้ำปาด/i,    th: "อุตรดิตถ์",       en: "Uttaradit",        lat: 17.62, lon: 100.10 },
  { kind: "specific", re: /sukhothai|สุโขทัย|ศรีสัชนาลัย|สวรรคโลก/i, th: "สุโขทัย",       en: "Sukhothai",        lat: 17.01, lon: 99.82 },
  { kind: "specific", re: /kamphaeng ?phet|กำแพงเพชร|คลองลาน/i,    th: "กำแพงเพชร",       en: "Kamphaeng Phet",   lat: 16.48, lon: 99.52 },

  /* กลาง */
  { kind: "specific", re: /uthai ?thani|อุทัยธานี|ห้วยคต/i,        th: "อุทัยธานี",       en: "Uthai Thani",      lat: 15.38, lon: 100.02 },
  { kind: "specific", re: /chai ?nat|ชัยนาท|สรรพยา|เขื่อนเจ้าพระยา/i, th: "ชัยนาท",       en: "Chai Nat",         lat: 15.19, lon: 100.13 },
  { kind: "specific", re: /sing ?buri|สิงห์บุรี|อินทร์บุรี/i,      th: "สิงห์บุรี",       en: "Sing Buri",        lat: 14.89, lon: 100.40 },
  { kind: "specific", re: /ang ?thong|อ่างทอง|ป่าโมก/i,            th: "อ่างทอง",         en: "Ang Thong",        lat: 14.59, lon: 100.46 },
  { kind: "specific", re: /lop ?buri|ลพบุรี|บ้านหมี่|ชัยบาดาล/i,   th: "ลพบุรี",          en: "Lop Buri",         lat: 14.80, lon: 100.65 },
  { kind: "specific", re: /suphan ?buri|สุพรรณบุรี|บางปลาม้า|สองพี่น้อง/i, th: "สุพรรณบุรี", en: "Suphan Buri",   lat: 14.47, lon: 100.12 },
  { kind: "specific", re: /nakhon ?pathom|นครปฐม|สามพราน|นครชัยศรี/i, th: "นครปฐม",       en: "Nakhon Pathom",    lat: 13.82, lon: 100.06 },
  { kind: "specific", re: /ratchaburi|ราชบุรี|ดำเนินสะดวก|บ้านโป่ง/i, th: "ราชบุรี",      en: "Ratchaburi",       lat: 13.53, lon: 99.81 },
  { kind: "specific", re: /nakhon ?nayok|นครนายก|บ้านนา|องครักษ์/i, th: "นครนายก",        en: "Nakhon Nayok",     lat: 14.20, lon: 101.21 },
  { kind: "specific", re: /prachin ?buri|ปราจีนบุรี|กบินทร์บุรี|ศรีมหาโพธิ/i, th: "ปราจีนบุรี", en: "Prachin Buri", lat: 14.05, lon: 101.37 },
  { kind: "specific", re: /chachoengsao|ฉะเชิงเทรา|แปดริ้ว|บางปะกง|บางคล้า/i, th: "ฉะเชิงเทรา", en: "Chachoengsao", lat: 13.69, lon: 101.07 },

  /* อีสาน */
  { kind: "specific", re: /kalasin|กาฬสินธุ์|เขื่อนลำปาว|ยางตลาด/i, th: "กาฬสินธุ์",      en: "Kalasin",          lat: 16.43, lon: 103.51 },
  { kind: "specific", re: /roi ?et|ร้อยเอ็ด|เสลภูมิ|โพนทอง/i,      th: "ร้อยเอ็ด",        en: "Roi Et",           lat: 16.06, lon: 103.65 },
  { kind: "specific", re: /maha ?sarakham|มหาสารคาม|โกสุมพิสัย/i,  th: "มหาสารคาม",       en: "Maha Sarakham",    lat: 16.18, lon: 103.30 },
  { kind: "specific", re: /sakon ?nakhon|สกลนคร|หนองหาร|สว่างแดนดิน/i, th: "สกลนคร",      en: "Sakon Nakhon",     lat: 17.16, lon: 104.15 },
  { kind: "specific", re: /bueng ?kan|บึงกาฬ|ปากคาด|เซกา/i,        th: "บึงกาฬ",          en: "Bueng Kan",        lat: 18.36, lon: 103.65 },
  { kind: "specific", re: /nong ?bua ?lam ?phu|หนองบัวลำภู|ศรีบุญเรือง/i, th: "หนองบัวลำภู", en: "Nong Bua Lam Phu", lat: 17.20, lon: 102.44 },
  { kind: "specific", re: /\bloei\b|(?:จังหวัด|จ\.\s?)เลย|เมืองเลย|เชียงคาน|ภูเรือ|ด่านซ้าย/i,
                                                                  th: "เลย",             en: "Loei",             lat: 17.49, lon: 101.73 },
  { kind: "specific", re: /yasothon|ยโสธร|เลิงนกทา|มหาชนะชัย/i,    th: "ยโสธร",           en: "Yasothon",         lat: 15.79, lon: 104.15 },
  { kind: "specific", re: /amnat ?charoen|อำนาจเจริญ|ชานุมาน/i,    th: "อำนาจเจริญ",      en: "Amnat Charoen",    lat: 15.86, lon: 104.63 },
  { kind: "specific", re: /si ?sa ?ket|ศรีสะเกษ|กันทรลักษ์|ขุนหาญ/i, th: "ศรีสะเกษ",      en: "Si Sa Ket",        lat: 15.12, lon: 104.32 },

  { re: /gulf of thailand|อ่าวไทย|ท้องอ่าว/i,                                   th: "อ่าวไทย",                   en: "Gulf of Thailand",        lat: 9.5,  lon: 101.5 },
  { re: /andaman|ทะเลอันดามัน|อนุดามัน/i,                                            th: "ทะเลอันดามัน",              en: "Andaman Sea",             lat: 8.0,  lon: 97.0 },

  /* ตัวรับท้ายของกลุ่มไทย — ข่าวที่บอกแค่ว่าเกิดในไทยแต่ไม่ระบุจังหวัด
     ต้องอยู่ "หลัง" อ่าวไทย/อันดามัน ไม่ใช่ก่อน เพราะคำว่า Thailand
     อยู่ใน "Gulf of Thailand" ด้วย — วางสลับที่แล้วข่าวอ่าวไทยจะไปลงกรุงเทพฯ */
  { re: /\bthailand\b|\bthai\b|ประเทศไทย|ในไทย|ราชอาณาจักรไทย/i, th: "ประเทศไทย",        en: "Thailand",         lat: 13.75, lon: 100.52 },
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

  /* ── พื้นที่ที่พบบ่อยในพาดหัวจริงแต่ตารางเดิมไม่รู้จัก ──────────────
     วัดจากข่าว 500 ชิ้นในคลัง: ข่าวเหล่านี้เคยถูกปักผิดที่ผ่านคำแปล
     หรือไม่ถูกปักเลย ทั้งที่พาดหัวบอกสถานที่ชัด

     ตั้งใจไม่ใส่ "Russia" — น่านน้ำรัสเซียมีตั้งแต่บอลติก ทะเลดำ อาร์กติก
     ถึงแปซิฟิก การปักจุดเดียวให้ทั้งประเทศคือการเดา ซึ่งเป็นสิ่งที่เพิ่งแก้ไป */
  { re: /english channel|dover strait|pas de calais|ช่องแคบอังกฤษ/i,   th: "ช่องแคบอังกฤษ",   en: "English Channel",  lat: 50.3,  lon: 0.5 },
  { re: /panama canal|\bpanama\b|คลองปานามา/i,                        th: "คลองปานามา",      en: "Panama Canal",     lat: 9.1,   lon: -79.7 },
  { re: /suez canal|\bsuez\b|คลองสุเอซ/i,                             th: "คลองสุเอซ",       en: "Suez Canal",       lat: 30.5,  lon: 32.35 },
  { re: /gibraltar|ยิบรอลตาร์/i,                                      th: "ช่องแคบยิบรอลตาร์", en: "Strait of Gibraltar", lat: 35.95, lon: -5.6 },
  { re: /philippines?|philippine|manila|luzon|palawan|subic|ฟิลิปปินส์/i, th: "ฟิลิปปินส์",   en: "Philippines",      lat: 13.0,  lon: 122.0 },
  { re: /indonesia|indonesian|jakarta|surabaya|batam|อินโดนีเซีย/i,    th: "อินโดนีเซีย",     en: "Indonesia",        lat: -2.5,  lon: 118.0 },
  { re: /vietnam|viet nam|vietnamese|haiphong|da nang|เวียดนาม/i,      th: "เวียดนาม",        en: "Vietnam",          lat: 16.0,  lon: 109.0 },
  { re: /\btaiwan\b|kaohsiung|ไต้หวัน/i,                              th: "ไต้หวัน",         en: "Taiwan",           lat: 24.0,  lon: 121.5 },
  { re: /north korea|dprk|pyongyang|เกาหลีเหนือ/i,                     th: "เกาหลีเหนือ",     en: "North Korea",      lat: 39.0,  lon: 127.5 },
  { re: /sri lanka|colombo|ศรีลังกา/i,                                th: "ศรีลังกา",        en: "Sri Lanka",        lat: 6.9,   lon: 79.8 },

  /* ── มหาสมุทร / ทะเลกว้าง (ตัวสุดท้าย — ใช้เมื่อไม่เจอที่เจาะจงกว่า) ── */
  { re: /mediterranean|aegean|libya|gaza|ทะเลเมดิเตอร์/i,       th: "ทะเลเมดิเตอร์เรเนียน",       en: "Mediterranean Sea",       lat: 34.0, lon: 18.0 },
  { re: /north sea|norway|norwegian|denmark|ทะเลเหนือ|นอร์เวย์/i, th: "ทะเลเหนือ",                en: "North Sea",               lat: 56.5, lon: 3.0 },
  { re: /arctic|icebreaker|svalbard|greenland|อาร์กติก|เรือตัดน้ำแข็ง/i, th: "มหาสมุทรอาร์กติก",   en: "Arctic Ocean",            lat: 78.0, lon: 15.0 },
  { re: /indian ocean|มหาสมุทรอินเดีย/i,                        th: "มหาสมุทรอินเดีย",           en: "Indian Ocean",            lat: 5.0,  lon: 75.0 },
  { re: /pacific|แปซิฟิก/i,                                     th: "มหาสมุทรแปซิฟิก",           en: "Pacific Ocean",           lat: 5.0,  lon: 175.0 },
  { re: /atlantic|แอตแลนติก/i,                                  th: "มหาสมุทรแอตแลนติก",         en: "Atlantic Ocean",          lat: 28.0, lon: -40.0 },
];

// รับข้อความหลายชิ้น (หัวข้อ/สรุป ไทย+อังกฤษ) → {lat, lon, th, en} หรือ null
/* ============================================================
   ระบุตำแหน่งเหตุการณ์จากข่าว

   ⚠ กฎเหล็กสองข้อ เกิดจากบั๊กจริงที่เจอ:

   1. ห้ามใช้ "ข้อความที่แปลด้วยเครื่อง" หาพิกัด
      ข่าว MAREX "Maritime Security: A War Gone Wrong" พูดถึงอ่าวเปอร์เซีย
      Google แปล "Conflict in the Gulf" เป็น "ความขัดแย้งในอ่าวไทย"
      แล้วตัวจับคู่เดิมไปเจอคำว่า "อ่าวไทย" ในคำแปล จึงปักหมุดกลางอ่าวไทย
      ทั้งที่ข้อความอังกฤษต้นฉบับจับคู่ไม่ได้เลยสักกฎ
      คำแปลจึง "สร้าง" ตำแหน่งขึ้นมาเอง ไม่ใช่พิกัด default ที่ไหน

   2. ห้ามใช้ชื่อสำนักข่าวหาพิกัด
      สำนักข่าวอยู่ประเทศหนึ่ง ไม่ได้แปลว่าเหตุเกิดที่นั่น

   จับคู่กับ "ข้อความภาษาต้นฉบับ" เท่านั้น — n.raw.en กับ n.ai.en
   ซึ่งเก็บสิ่งที่สำนักข่าวเผยแพร่จริง ไม่ว่าจะภาษาใด
   ============================================================ */

/* ความเฉพาะเจาะจงของแต่ละพื้นที่ — กำหนดค่าความมั่นใจและสถานะ
   ⚠ เพิ่มพื้นที่ใหม่ใน MDA_GEO_REGIONS แล้วต้องมาเพิ่มชื่อที่นี่ด้วย
     ถ้าลืม จะถูกจัดเป็น "country" ซึ่งได้ความมั่นใจต่ำสุด (พังแบบปลอดภัย) */
const GEO_SPECIFIC = new Set([
  "Strait of Hormuz", "Strait of Malacca", "Ko Kut", "Koh Kong", "Trat",
  "Cambodia Coast", "Myanmar Coast", "Malaysia Coast",
  "English Channel", "Panama Canal", "Suez Canal", "Strait of Gibraltar",
  "Rotterdam–Antwerp",
  "Narathiwat", "Pattani", "Yala", "Songkhla", "Satun", "Tak", "Mae Hong Son",
  "Chiang Rai", "Chiang Mai", "Kanchanaburi", "Ranong", "Nong Khai",
  "Nakhon Phanom", "Mukdahan", "Ubon Ratchathani", "Sa Kaeo", "Chanthaburi",
  "Rayong", "Chon Buri", "Samut Prakan", "Samut Sakhon", "Samut Songkhram",
  "Phetchaburi", "Prachuap Khiri Khan", "Chumphon", "Surat Thani",
  "Nakhon Si Thammarat", "Phatthalung", "Phuket", "Krabi", "Phang Nga",
  "Trang", "Bangkok", "Nonthaburi", "Pathum Thani", "Ayutthaya", "Saraburi",
  "Nakhon Sawan", "Phitsanulok", "Phichit", "Phetchabun", "Khon Kaen",
  "Nakhon Ratchasima", "Udon Thani", "Chaiyaphum", "Surin", "Buri Ram",
]);
const GEO_WATER = new Set([
  "Red Sea / Bab el-Mandeb", "Persian Gulf", "Gulf of Aden", "South China Sea",
  "Gulf of Thailand OCA", "Gulf of Thailand", "Andaman Sea",
  "North Natuna Sea", "Black Sea", "Baltic Sea", "Gulf of Guinea",
  "Arabian Sea / Horn", "Caribbean Sea", "East China Coast",
  "West Pacific (US)", "US East Coast", "Mediterranean Sea", "North Sea",
  "Arctic Ocean", "Indian Ocean", "Pacific Ocean", "Atlantic Ocean",
  "United Kingdom / North Sea", "Brazil / S. Atlantic", "Philippines",
]);

/* ยิ่งเจาะจง ยิ่งเชื่อได้ — และเลือกตัวที่เจาะจงที่สุดเสมอ ไม่ใช่ตัวแรกที่เจอ
   ของเดิมเลือกตัวแรกในตาราง ลำดับในไฟล์จึงกลายเป็นตัวตัดสินโดยบังเอิญ */
const GEO_RANK = { point: 0, specific: 1, water: 2, country: 3 };

/* กฎที่เขียน kind ติดมากับตัวเองเป็นตัวตัดสินก่อนเสมอ · Set สองชุดด้านบน
   เหลือไว้ให้กฎชุดเดิมที่ยังไม่ได้ระบุ kind

   เหตุที่เปลี่ยนวิธี: ของเดิมต้องไปเติมชื่อใน GEO_SPECIFIC ทุกครั้งที่เพิ่ม
   พื้นที่ ลืมเมื่อไรกฎนั้นกลายเป็น "country" เงียบ ๆ (ความมั่นใจต่ำสุด)
   ไม่มีอะไรเตือน — เขียน kind ไว้ในกฎเลยจึงลืมไม่ได้ */
function geoKind(rule) {
  if (rule && rule.kind) return rule.kind;
  const en = typeof rule === "string" ? rule : (rule && rule.en) || "";
  if (GEO_SPECIFIC.has(en)) return "specific";
  if (GEO_WATER.has(en))    return "water";
  return "country";
}

/* ไม่มีระดับ "verified" ที่นี่โดยตั้งใจ — การจับคู่คำไม่ใช่การยืนยัน
   "verified" สงวนไว้ให้เจ้าหน้าที่ยืนยันด้วยตัวเองเท่านั้น */
const GEO_GRADE = {
  /* conflictKm — ห่างกันเกินเท่านี้ถือว่าข่าวชี้ไปคนละที่ จนตัดสินไม่ได้
     ต้องขึ้นกับความเฉพาะเจาะจง: หมุดระดับจังหวัดที่ผิดไป 500 กม. คือผิด
     แต่ "ทะเลจีนใต้" กับ "ทะเลอันดามัน" ห่างกันเป็นพันกิโลเมตรโดยธรรมชาติ
     ใช้เกณฑ์เดียวทั้งหมดจะจับผิดฝั่งใดฝั่งหนึ่งเสมอ */
  /* point = ท่าเรือ/เกาะ/ปากน้ำ ระบุได้ระดับจุด — ข่าวที่ชี้จุดต่างกันเกิน
     150 กม. คือชี้คนละที่แน่นอน ไม่ใช่ความคลาดเคลื่อนของหมุด */
  point:    { confidence: 0.90, status: "probable",    conflictKm: 150 },
  specific: { confidence: 0.85, status: "probable",    conflictKm: 400 },
  water:    { confidence: 0.60, status: "approximate", conflictKm: 2500 },
  country:  { confidence: 0.35, status: "unverified",  conflictKm: 6000 },
};

function geoDistanceKm(a, b) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function geoMatchesIn(text) {
  if (!text) return [];
  const out = [];
  for (let i = 0; i < MDA_GEO_REGIONS.length; i++) {
    const r = MDA_GEO_REGIONS[i];
    const m = text.match(r.re);
    if (m) out.push({ rule: r, kind: geoKind(r), hit: m[0] });
  }
  return out;
}

/* ที่ปรากฏใน "พาดหัว" มีน้ำหนักกว่าที่โผล่กลางเนื้อข่าว — พาดหัวมักบอก
   ที่เกิดเหตุ ส่วนเนื้อข่าวเอ่ยถึงหลายที่ปนกัน (ข้อ 4 ของโจทย์)
   ถ้าพาดหัวจับได้ ใช้พาดหัวอย่างเดียว ไม่เอาเนื้อข่าวมาปน */
function geocodeNews(n) {
  if (!n) return null;
  const title = (n.raw && n.raw.en) || "";       // ต้นฉบับ ไม่ใช่คำแปล
  const body  = (n.ai  && n.ai.en)  || "";       // ต้นฉบับ ไม่ใช่คำแปล

  let field = "title";
  let ms = geoMatchesIn(title);
  if (!ms.length) { field = "summary"; ms = geoMatchesIn(body); }
  if (!ms.length) return null;                    // ระบุไม่ได้ → ไม่ปักหมุด

  const bestRank = Math.min.apply(null, ms.map(m => GEO_RANK[m.kind]));
  const top = ms.filter(m => GEO_RANK[m.kind] === bestRank);

  /* เจอหลายที่ที่เจาะจงเท่ากันแต่อยู่คนละมุมโลก = ตัดสินไม่ได้
     ปักไปก็มีโอกาสผิดครึ่งหนึ่ง — บอกว่าขัดแย้งแล้วไม่ปักดีกว่า */
  const limit = GEO_GRADE[top[0].kind].conflictKm;
  for (let i = 1; i < top.length; i++) {
    if (geoDistanceKm(top[0].rule, top[i].rule) > limit) {
      return {
        lat: null, lon: null,
        en: top.map(m => m.rule.en).join(" / "),
        th: top.map(m => m.rule.th).join(" / "),
        confidence: 0.2, status: "conflict",
        evidence: { text: top.map(m => m.hit).join(" / "), field, rule: "multiple" },
      };
    }
  }

  const win = top[0];
  const g = GEO_GRADE[win.kind];
  // เจอในเนื้อข่าวไม่ใช่พาดหัว → ลดความมั่นใจลง ยังใช้ได้แต่เชื่อได้น้อยกว่า
  const conf = field === "title" ? g.confidence : Math.round(g.confidence * 0.8 * 100) / 100;
  return {
    lat: win.rule.lat, lon: win.rule.lon, th: win.rule.th, en: win.rule.en,
    confidence: conf, status: g.status,
    evidence: { text: win.hit, field, rule: win.rule.en },
  };
}

/* ตัวเดิม — เก็บไว้ให้โค้ดเก่าที่ยังเรียกอยู่ไม่พัง แต่ห้ามใช้กับข่าว
   เพราะไม่มีทางรู้ว่าอาร์กิวเมนต์ไหนเป็นคำแปล ใช้ geocodeNews(n) แทน */
function geocodeText() {
  const text = Array.prototype.slice.call(arguments).filter(Boolean).join("  ");
  const ms = geoMatchesIn(text);
  if (!ms.length) return null;
  const bestRank = Math.min.apply(null, ms.map(m => GEO_RANK[m.kind]));
  const win = ms.filter(m => GEO_RANK[m.kind] === bestRank)[0];
  return { lat: win.rule.lat, lon: win.rule.lon, th: win.rule.th, en: win.rule.en };
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
    const geo = geocodeNews(n);          // ต้นฉบับเท่านั้น ไม่เอาคำแปล/ชื่อสำนักข่าว
    if (!geo || geo.lat == null) return;                // ระบุพื้นที่ไม่ได้/ขัดแย้ง → ไม่ปักหมุด
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
/* ไม่ปิดท้ายกลุ่มอังกฤษด้วย \b — รายการนี้เป็น "รากคำ" ไม่ใช่คำเต็ม
   ถ้าใส่ \b ปิดท้าย seiz/capsiz/smuggl จะไม่มีวันตรงกับอะไรเลย (ไม่มีคำว่า
   "seiz" ในภาษาอังกฤษ) และ detain/intercept จะไม่จับ detained/intercepted
   ผลคือ "Navy seized a trawler" ตกไปเป็น medium หรือถูกทิ้งทั้งชิ้น
   เปิดท้ายไว้จึงครอบ seized · seizure · capsized · smuggling ตามที่ตั้งใจ */
const EV_SEV_HIGH = /\b(seiz|detain|collision|capsiz|distress|piracy|pirate|smuggl|illegal fishing|incursion|intercept|boarded|sabotage)|ยึดเรือ|ควบคุมตัว|ชนกัน|พลิกคว่ำ|ขอความช่วยเหลือ|โจรสลัด|ลักลอบ|ประมงผิดกฎหมาย|รุกล้ำ|สกัดกั้น|ก่อวินาศกรรม/i;

/* ข่าวที่ "พูดถึง" ภัยแต่ไม่ใช่เหตุการณ์ — จัดซื้อ งบประมาณ ต่อเรือ ซ้อมรบ
   ทดลองอาวุธ ข่าวธุรกิจ ล้วนเต็มไปด้วยคำว่าโดรน ขีปนาวุธ เรือรบ
   ถ้าไม่กันออก แผงเฝ้าระวังจะเต็มไปด้วยข่าวจัดซื้อจนของจริงจมหาย

   "สัญญา" ต้องกัน "สัญญาณ" ออกด้วย lookahead — ภาษาไทยไม่มีขอบเขตคำ
   ถ้าปล่อยไว้ พาดหัวอย่าง "เรือประมงปิดสัญญาณ AIS" หรือ "รับสัญญาณขอความ
   ช่วยเหลือ" จะถูกทิ้งเป็นข่าวจัดซื้อ ทั้งที่เป็นเหตุการณ์ที่ต้องเฝ้าระวังที่สุด */
const EV_NOT_INCIDENT = /\b(order|orders|ordered|contract|tender|procure|procurement|budget|billion|cost|deliver(y|ed)|christen|keel|shipyard|exercise|drill|trial|prototype|concept|unveil|explores?|study|report says)\b|คำสั่งซื้อ|สัญญา(?!ณ)|งบประมาณ|จัดซื้อ|จัดหา|ต่อเรือ|อู่ต่อเรือ|ซ้อมรบ|ทดสอบ|ทดลอง|ต้นแบบ|เปิดตัว|ผลการศึกษา|พันล้าน/i;

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

    const geo = geocodeNews(n);          // ต้นฉบับเท่านั้น ไม่เอาคำแปล/ชื่อสำนักข่าว
    if (!geo || geo.lat == null) return;    // ระบุพื้นที่ไม่ได้/ขัดแย้ง = ปักหมุดไม่ได้
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
      /* ตัด " - ชื่อสำนักข่าว" ที่ Google News ต่อท้ายออกจากพาดหัว —
         ชื่อสำนักข่าวย้ายไปอยู่ช่อง source แล้ว ปล่อยไว้จะซ้ำสองที่ */
      title:    (() => {
        const cut = (s) => (window.splitGoogleNewsOutlet
          ? window.splitGoogleNewsOutlet(s, n.outlet).head : s);
        return { th: cut(th || en), en: cut(en || th) };
      })(),
      summary:  { th: sth || sum, en: sum || sth },
      lat:      geo.lat,
      lon:      geo.lon,
      vessel:   null,
      conf:     n.credibility || 3,
      tags:     [],
      /* ใช้สำนักข่าวจริงที่แยกออกจากท้ายพาดหัว ไม่ใช่ชื่อ query ของเรา
         มิฉะนั้นหน้ารายละเอียดจะขึ้นที่มาว่า "ในประเทศ (Google News)" */
      source:   {
        outlet: (window.splitGoogleNewsOutlet
          ? window.splitGoogleNewsOutlet(en || th, n.outlet).outlet
          : (n.outlet || "")),
        url: n.url || "",
      },
      resolved: false,
      origin:   "news",                     // แยกจาก "cron"/"manual" ได้ที่ปลายทาง
      /* ข่าวไม่มีช่อง publishedAt — มีแต่ n.time (ISO สำหรับข่าวสด)
         ถ้าปล่อยเป็น null ตัวกรองช่วงเวลาจะทิ้งเหตุการณ์กลุ่มนี้ทั้งหมด
         (inTimeWindow คืน false เมื่อแปลงวันที่ไม่ได้) พอผู้ใช้เลือก "24 ชม."
         แผงก็ว่างเปล่าอีกครั้ง ซึ่งคือปัญหาที่ฟีเจอร์นี้ตั้งใจแก้พอดี
         รับเฉพาะรูปแบบ ISO — ข่าวตั้งต้นเก็บเป็น "07:30" ซึ่งไม่ใช่วันที่ */
      publishedAt: n.publishedAt
        || (/^\d{4}-\d{2}-\d{2}/.test(String(n.time || "")) ? n.time : null),
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

    const geo = geocodeNews(n);          // ต้นฉบับเท่านั้น ไม่เอาคำแปล/ชื่อสำนักข่าว
    /* lat เป็น null ได้เมื่อสถานะเป็น conflict — ต้องเช็คด้วย ไม่ใช่เช็คแค่ว่ามี
       ออบเจกต์ ไม่งั้น null + rad*cos() กลายเป็น NaN แล้ว Leaflet ปักหมุดเพี้ยน */
    if (!geo || geo.lat == null) return;   // ระบุพื้นที่ไม่ได้/ขัดแย้ง → ไม่ปักหมุด

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
      image:   n.image || "",        // ว่างได้ — หลายฟีดไม่ส่งรูปมา
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
    /* escalated_at เป็นตัวชี้ขาด ไม่มี flag แยก — ดู supabase/events_escalation.sql */
    escalatedAt: r.escalated_at || null,
    escalatedBy: r.escalated_by || "",
    /* ข้อมูลกำกับตำแหน่ง — บอกว่าพิกัดนี้เชื่อได้แค่ไหนและมาจากไหน
       loc_source = "analyst" คือคนแก้เอง ตัวประมวลผลอัตโนมัติห้ามทับ */
    locStatus:     r.loc_status || (r.lat == null ? "unknown" : "unverified"),
    locConfidence: r.loc_confidence == null ? null : Number(r.loc_confidence),
    locEvidence:   r.loc_evidence || "",
    locSource:     r.loc_source || "rule",
    locUpdatedAt:  r.loc_updated_at || null,
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
    escalated_at:  o.escalatedAt || null,
    escalated_by:  o.escalatedBy || null,
    loc_status:     o.locStatus || null,
    loc_confidence: o.locConfidence == null ? null : o.locConfidence,
    loc_evidence:   o.locEvidence || null,
    loc_source:     o.locSource || "rule",
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
    /* RLS ปฏิเสธจะได้ code 42501 พร้อมข้อความอังกฤษที่พูดถึง policy
       ซึ่งผู้ใช้อ่านแล้วไม่รู้ว่าต้องทำอะไร — แปลให้ตรงประเด็น
       (ปกติปุ่มถูกซ่อนไปแล้ว เส้นนี้จึงเป็นตาข่ายรับกรณีเรียกตรงจาก devtools
        หรือกรณีสิทธิ์ถูกเปลี่ยนระหว่างที่เปิดฟอร์มค้างไว้) */
    if (error && (error.code === "42501" || /row-level security|policy/i.test(error.message || "")))
      return { error: "ไม่มีสิทธิ์เพิ่มเหตุการณ์ — ต้องเป็นผู้บัญชาการ ผู้ดูแลระบบ หรือยศชั้นสัญญาบัตร" };
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
}

/* เขียนสถานะยกระดับกลับ Supabase — แตะแค่สองคอลัมน์ ไม่ส่งทั้งแถว
   ถ้าส่งทั้งแถวจะทับงานที่คนอื่นเพิ่งแก้ในเหตุการณ์เดียวกัน

   ปลด: ส่ง null ทั้งคู่ · ยกระดับ: ส่งเวลาปัจจุบันกับชื่อผู้กด
   สิทธิ์บังคับที่ policy events_command_update ฝั่ง Supabase ไม่ใช่ที่นี่ */
async function setEventEscalation(id, by) {
  const SB = window.MDA_SB;
  if (!SB) return { error: "no_supabase" };
  const patch = by
    ? { escalated_at: new Date().toISOString(), escalated_by: by }
    : { escalated_at: null, escalated_by: null };
  try {
    const { error } = await SB.from("events").update(patch).eq("id", id);
    if (error) {
      if (error.code === "42501" || /row-level security|policy/i.test(error.message || ""))
        return { error: "ไม่มีสิทธิ์ยกระดับ — ต้องเป็นผู้บัญชาการ ผู้ดูแลระบบ หรือยศชั้นสัญญาบัตร" };
      return { error: error.message };
    }
    return { ok: true, patch };
  } catch (e) {
    return { error: String(e) };
  }
}

/* ============================================================
   ตำแหน่งเหตุการณ์: ประมวลผลใหม่ · แก้โดยเจ้าหน้าที่ · ประวัติ
   (ข้อ 17/18/19 ของโจทย์)
   ============================================================ */

/* หาพื้นที่จาก "ข้อความของเหตุการณ์" ด้วยกฎชุดเดียวกับข่าว
   ใช้ภาษาต้นฉบับเท่านั้น (title_en/summary_en) ด้วยเหตุผลเดียวกับ geocodeNews */
function geocodeEvent(ev) {
  return geocodeNews({
    raw: { en: (ev.title && ev.title.en) || "", th: "" },
    ai:  { en: (ev.summary && ev.summary.en) || "", th: "" },
  });
}

/* ── ข้อ 17: ประมวลผลตำแหน่งของเหตุการณ์เก่าใหม่ทั้งหมด ──────────
   ใช้ตัวจับคู่ตัวเดียวกับที่แผนที่ใช้ ผลจึงตรงกันเสมอ ไม่ใช่ตรรกะคู่ขนาน

   ⚠ ข้ามแถวที่ loc_source = "analyst" — ของที่คนตรวจแล้วแก้มือ
     ห้ามให้ตัวอัตโนมัติทับ ไม่งั้นงานตรวจสอบหายทุกครั้งที่กดปุ่มนี้ */
async function reprocessEventLocations(opts) {
  const SB = window.MDA_SB;
  if (!SB) return { error: "no_supabase" };
  const dryRun = !!(opts && opts.dryRun);
  const reason = (opts && opts.reason) || "reprocess: rule update";

  const { data, error } = await SB.from("events").select("*").limit(5000);
  if (error) return { error: error.message };

  const rows = data || [];
  const summary = { total: rows.length, skippedAnalyst: 0, unchanged: 0,
                    updated: 0, cleared: 0, failed: 0, changes: [] };

  for (const r of rows) {
    if ((r.loc_source || "rule") === "analyst") { summary.skippedAnalyst++; continue; }

    const g = geocodeEvent(eventRowToObj(r));
    const nextLat  = g ? g.lat : null;
    const nextLon  = g ? g.lon : null;
    const nextStat = g ? g.status : "unknown";
    const nextConf = g ? g.confidence : null;
    const nextEv   = g && g.evidence ? g.evidence.text : null;
    const nextName = g ? g.en : null;

    const same = (r.lat == null ? null : Number(r.lat)) === nextLat
              && (r.lon == null ? null : Number(r.lon)) === nextLon
              && (r.loc_status || null) === nextStat;
    if (same) { summary.unchanged++; continue; }

    summary.changes.push({
      id: r.id,
      title: (r.title_en || "").slice(0, 60),
      from: { name: r.area_en || null, lat: r.lat, lon: r.lon, status: r.loc_status || null },
      to:   { name: nextName, lat: nextLat, lon: nextLon, status: nextStat },
    });
    if (nextLat == null && r.lat != null) summary.cleared++; else summary.updated++;

    if (dryRun) continue;
    const patch = {
      lat: nextLat, lon: nextLon,
      loc_status: nextStat, loc_confidence: nextConf, loc_evidence: nextEv,
      loc_source: "rule", loc_reason: reason,
    };
    /* ชื่อพื้นที่ตามไปด้วย ไม่งั้นหมุดย้ายแต่ป้ายยังเป็นที่เดิม
       ระบุไม่ได้ → ล้างชื่อทิ้ง ดีกว่าค้างชื่อเก่าที่ไม่ตรงกับอะไรแล้ว */
    patch.area_en = nextName; patch.area_th = g ? g.th : null;
    const up = await SB.from("events").update(patch).eq("id", r.id).select("id");
    if (up.error || !(up.data || []).length) summary.failed++;
  }
  return { ok: true, dryRun, summary };
}

/* ── ข้อ 18: เจ้าหน้าที่แก้ตำแหน่งเอง ────────────────────────────
   บันทึกด้วย loc_source = "analyst" เพื่อแยกจากค่าที่กฎคำนวณ
   และเพื่อให้ reprocessEventLocations ข้ามแถวนี้ไปตลอด */
async function saveEventLocationByAnalyst(eventId, loc) {
  const SB = window.MDA_SB;
  if (!SB) return { error: "no_supabase" };

  const lat = loc.lat === "" || loc.lat == null ? null : Number(loc.lat);
  const lon = loc.lon === "" || loc.lon == null ? null : Number(loc.lon);
  if (lat != null && (!isFinite(lat) || Math.abs(lat) > 90))
    return { error: "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90" };
  if (lon != null && (!isFinite(lon) || Math.abs(lon) > 180))
    return { error: "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180" };
  /* มีพิกัดครึ่งเดียวใช้ไม่ได้ — ปักหมุดไม่ได้และคำนวณระยะไม่ได้
     ต้องบังคับให้ครบคู่หรือไม่มีเลย */
  if ((lat == null) !== (lon == null))
    return { error: "ต้องกรอกละติจูดและลองจิจูดให้ครบทั้งคู่ หรือเว้นว่างทั้งคู่" };
  if (lat == null && loc.status !== "unknown")
    return { error: "ไม่มีพิกัด สถานะต้องเป็น unknown" };

  const patch = {
    lat, lon,
    area_en: loc.nameEn || null, area_th: loc.nameTh || loc.nameEn || null,
    loc_status: loc.status, loc_source: "analyst",
    loc_confidence: lat == null ? null : (loc.status === "verified" ? 1 : 0.7),
    loc_evidence: loc.evidence || null,
    loc_reason: loc.reason || "analyst correction",
  };
  const { data, error } = await SB.from("events").update(patch).eq("id", eventId).select("id");
  if (error) {
    if (error.code === "42501" || /row-level security|policy/i.test(error.message || ""))
      return { error: "ไม่มีสิทธิ์แก้ตำแหน่ง — ต้องเป็นผู้บัญชาการ ผู้ดูแลระบบ หรือยศชั้นสัญญาบัตรที่ยืนยันแล้ว" };
    if (/loc_status|column .* does not exist|schema cache/i.test(error.message || ""))
      return { error: "ยังไม่ได้เพิ่มคอลัมน์ตำแหน่ง — ต้องรัน supabase/event_location.sql ก่อน" };
    return { error: error.message };
  }
  if (!(data || []).length) return { error: "ไม่มีสิทธิ์แก้ตำแหน่ง (ไม่มีแถวถูกแก้)" };
  return { ok: true };
}

/* ── ข้อ 19: อ่านประวัติการเปลี่ยนตำแหน่ง ────────────────────── */
async function loadLocationAudit(eventId) {
  const SB = window.MDA_SB;
  if (!SB) return { rows: [], error: "no_supabase" };
  const { data, error } = await SB.from("event_location_audit")
    .select("*").eq("event_id", eventId)
    .order("changed_at", { ascending: false }).limit(50);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message || ""))
      return { rows: [], error: "ยังไม่ได้สร้างตารางประวัติ — ต้องรัน supabase/event_location.sql" };
    return { rows: [], error: error.message };
  }
  return { rows: data || [], error: null };
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

  /* ModalPortal ยกกล่องออกไป render ที่ document.body — จำเป็น ไม่ใช่ทางเลือก
     เพราะแถบเครื่องมือหน้าแผนที่ตั้ง transform ไว้ตอนเข้าเต็มจอ ซึ่งสร้าง
     stacking context ขังกล่องนี้ไว้ข้างใน z-index เท่าไรก็ไม่ชนะแผนที่
     z 920: เหนือแผนที่เต็มจอ (890) · ต่ำกว่า Toast (999) ให้ข้อความยืนยันยังเห็น */
  return (
    <window.ModalPortal>
    <div style={{ position: "fixed", inset: 0, zIndex: 920, background: "rgba(0,0,0,0.6)",
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
    </window.ModalPortal>
  );
}

function AddEventButton({ addEvent, lang, showToast, className, currentUser }) {
  const [open, setOpen] = React.useState(false);
  const T = (th, en) => (lang === "th" ? th : en);

  /* เขียนตาราง events ได้เฉพาะคนที่สั่งการได้ — บังคับจริงที่ RLS ฝั่ง Supabase
     (policy events_command_insert ใน supabase/permissions.sql)
     ซ่อนปุ่มตรงนี้ให้ตรงกัน ไม่งั้นผู้ใช้กรอกฟอร์มจนเสร็จแล้วเจอ error ดิบ
     จากฐานข้อมูล ซึ่งไม่บอกว่าเป็นเรื่องสิทธิ์ */
  if (!window.can(currentUser, "command")) return null;

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
  useEventsUpdater, addEventToSupabase, setEventEscalation,
  geocodeEvent, reprocessEventLocations, saveEventLocationByAnalyst, loadLocationAudit,
  loadEventsFromSupabase, queryEventsArchive,
  AddEventModal, AddEventButton, REGION_PRESETS,
  geocodeText, geocodeNews, geoKind, MDA_GEO_REGIONS,
  extractVesselsFromNews, extractNewsPointsFromNews,
  extractEventsFromNews, mergeEvents,
});
