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

  // ---- vessels (global) ----
  const vessels = [
    { id:"V-RS01", name:"MT SEA-LINKED (target)", flag:"LR", type:"tanker", course:340, sp:11.5, lat:14.2, lon:42.6, status:"watch",   note:{th:"เสี่ยงถูกโจมตีในทะเลแดง", en:"At risk of Red Sea attack"} },
    { id:"V-SC01", name:"MV DEVON BAY",           flag:"SG", type:"dark",   course:0,   sp:0,    lat:15.9, lon:117.7, status:"critical", note:{th:"อับปาง — ปฏิบัติการค้นหา-กู้ภัย", en:"Capsized — SAR ongoing"} },
    { id:"V-SC02", name:"CCG-3104 (China CG)",    flag:"CN", type:"navy",   course:120, sp:9.0,  lat:15.2, lon:117.9, status:"watch",   note:{th:"เรือยามฝั่งจีนในพื้นที่พิพาท", en:"China CG in disputed area"} },
    { id:"V-BL01", name:"MV FITBURG",             flag:"??", type:"dark",   course:90,  sp:0,    lat:60.0, lon:24.5, status:"critical", note:{th:"กองเรือเงา — ถูกควบคุมตัว ปมสายเคเบิล", en:"Shadow fleet — detained, cable case"} },
    { id:"V-BK01", name:"MT (shadow, struck)",    flag:"??", type:"dark",   course:200, sp:6.0,  lat:44.6, lon:37.9, status:"critical", note:{th:"กองเรือเงารัสเซีย — ถูกโจมตี", en:"Russian shadow tanker — struck"} },
    { id:"V-HZ01", name:"MT GULF TRADER",         flag:"MH", type:"tanker", course:300, sp:10.2, lat:25.3, lon:56.6, status:"watch",   note:{th:"แจ้งสิ่งแปลกปลอมใกล้ฟูไจราห์", en:"Reported projectiles near Fujairah"} },
    { id:"V-NT01", name:"MV GEO SURVEYOR",        flag:"PA", type:"cargo",  course:75,  sp:4.0,  lat:5.1, lon:109.2, status:"watch",   note:{th:"สำรวจคลื่นไหวสะเทือน ถูกแทรกแซง", en:"Seismic survey, interfered"} },
    { id:"V-AD01", name:"MV ASIA CARRIER",        flag:"PA", type:"cargo",  course:255, sp:13.0, lat:12.6, lon:48.2, status:"watch",   note:{th:"เรือเล็กเข้าประชิดต้องสงสัย", en:"Suspicious skiff approach"} },
    { id:"V-GL05", name:"MSC LORETO",             flag:"PA", type:"cargo",  course:210, sp:18.5, lat:36.0, lon:14.5, status:"normal" },
    { id:"V-GL07", name:"MAERSK HALIFAX",         flag:"DK", type:"cargo",  course:95,  sp:19.0, lat:11.5, lon:55.0, status:"normal" },
    { id:"V-GL09", name:"MT PACIFIC GLORY",       flag:"MH", type:"tanker", course:30,  sp:12.0, lat:3.5, lon:104.5, status:"normal" },
    { id:"V-GL11", name:"FV LONG XING 21",        flag:"CN", type:"fishing",course:160, sp:4.5,  lat:-2.0, lon:-82.0, status:"watch", note:{th:"ต้องสงสัยทำประมงผิดกฎหมาย", en:"Suspected IUU fishing"} },
    { id:"V-GL13", name:"USS THE SULLIVANS",      flag:"US", type:"navy",   course:80,  sp:16.0, lat:13.0, lon:44.5, status:"friendly" },
    { id:"V-GL15", name:"FGS HESSEN",             flag:"DE", type:"navy",   course:200, sp:14.0, lat:58.0, lon:20.0, status:"friendly" },
  ];

  // ---- events / incidents (global, real-world based) ----
  const events = [
    {
      id:"INC-3041", sev:"critical", cat:"THREAT TO SHIPPING", srcKey:"GC",
      time:"08:40", ago:{th:"1 ชม.", en:"1 h"}, region:{th:"ทะเลแดง / ช่องแคบบับเอลมันเดบ", en:"Red Sea / Bab el-Mandeb"},
      lat:13.5, lon:43.3, vessel:"V-RS01", conf:4,
      title:{ th:"กลุ่มฮูตีส่งสัญญาณรื้อฟื้นการโจมตีเรือพาณิชย์ในทะเลแดง",
              en:"Houthis signal renewed attacks on shipping in the Red Sea" },
      area:{ th:"ทะเลแดงตอนใต้ · ช่องแคบบับเอลมันเดบ", en:"Southern Red Sea · Bab el-Mandeb Strait" },
      summary:{
        th:"หลังเงียบมาราว 3 เดือนครึ่งนับจากกลางเดือน พ.ย. 2025 กลุ่มฮูตีประกาศพร้อมกลับมาโจมตีเรือที่เชื่อมโยงสหรัฐฯ/อิสราเอล ภายหลังการโจมตีอิหร่านของสหรัฐฯ-อิสราเอล UKMTO ออกประกาศเตือน และ BIMCO ชี้ว่าเรือที่มีความเชื่อมโยงทางธุรกิจกับสหรัฐฯ/อิสราเอลเสี่ยงสูง เบี้ยประกันภัยสงครามมีแนวโน้มพุ่งขึ้นหลายเท่า",
        en:"After ~3.5 months of calm since mid-Nov 2025, the Houthis signaled they may resume strikes on US/Israel-linked ships following US-Israeli action against Iran. UKMTO issued an advisory; BIMCO warned that ships with US/Israeli business ties face elevated risk and war-risk premiums could rise sharply." },
      tags:["Houthi","Bab el-Mandeb","War risk","UKMTO"],
      source:{ outlet:"gCaptain", url:"https://gcaptain.com/houthis-signal-renewed-red-sea-shipping-attacks-after-u-s-israeli-strikes-on-iran/" },
      timeline:[
        { time:"D-3", lvl:"info", th:"สหรัฐฯ-อิสราเอลปฏิบัติการต่ออิหร่าน เพิ่มความตึงเครียดในภูมิภาค", en:"US-Israeli action against Iran raises regional tension." },
        { time:"D-1", lvl:"warn", th:"แถลงการณ์ฮูตีส่งสัญญาณพร้อมกลับมาโจมตีเรือ", en:"Houthi statements signal readiness to resume attacks." },
        { time:"06:10", lvl:"warn", th:"UKMTO ออกประกาศเตือนกิจกรรมทางทหารในอ่าวเปอร์เซีย/ฮอร์มุซ", en:"UKMTO advisory on military activity in the Gulf / Hormuz." },
        { time:"08:40", lvl:"crit", th:"ยกระดับเป็นเหตุวิกฤต — แจ้งเตือนเรือพาณิชย์ในเส้นทาง", en:"Escalated to critical — alert issued to commercial traffic." },
      ],
    },
    {
      id:"INC-3038", sev:"high", cat:"SAR / SINKING", srcKey:"ME",
      time:"Jan 23", ago:{th:"รายงานต่อเนื่อง", en:"ongoing"}, region:{th:"ทะเลจีนใต้", en:"South China Sea"},
      lat:15.9, lon:117.7, vessel:"V-SC01", conf:5,
      title:{ th:"เรือบรรทุกสินค้าธงสิงคโปร์อับปางใกล้สันดอนสการ์โบโรห์ มีผู้เสียชีวิต",
              en:"Singapore-flagged bulker sinks near Scarborough Shoal; fatalities reported" },
      area:{ th:"ทะเลจีนใต้ · ~100 กม. จากสันดอนสการ์โบโรห์", en:"South China Sea · ~100 km from Scarborough Shoal" },
      summary:{
        th:"เรือเทกอง Devon Bay (สิงคโปร์, ลูกเรือฟิลิปปินส์ 21 คน) ส่งสัญญาณขอความช่วยเหลือคืนวันที่ 22 ม.ค. ก่อนพลิกคว่ำ มีผู้เสียชีวิตอย่างน้อย 2 ราย กู้ได้ 17 คน สูญหาย 4 คน ทั้งจีนและฟิลิปปินส์ส่งเรือและอากาศยานเข้าค้นหา-ช่วยเหลือในพื้นที่พิพาทที่อ่อนไหว",
        en:"Bulk carrier Devon Bay (Singapore-flagged, 21 Filipino crew) issued a distress call late Jan 22 before capsizing. At least 2 dead, 17 rescued, 4 missing. Both China and the Philippines dispatched ships and aircraft for SAR in the sensitive disputed area." },
      tags:["SAR","Scarborough Shoal","Casualty","Disputed waters"],
      source:{ outlet:"The Maritime Executive", url:"https://maritime-executive.com/article/china-and-philippines-rush-to-save-seafarers-after-k-line-bulker-sinks" },
    },
    {
      id:"INC-3035", sev:"high", cat:"ATTACK / DARK FLEET", srcKey:"ST",
      time:"May 03", ago:{th:"รายงานยืนยัน", en:"confirmed"}, region:{th:"ทะเลดำ", en:"Black Sea"},
      lat:44.6, lon:37.9, vessel:"V-BK01", conf:4,
      title:{ th:"ยูเครนโจมตีเรือบรรทุกน้ำมัน 'กองเรือเงา' ของรัสเซียใกล้โนโวรอสซีสค์",
              en:"Ukraine strikes Russian 'shadow fleet' tankers near Novorossiysk" },
      area:{ th:"ทะเลดำ · ใกล้ท่าโนโวรอสซีสค์", en:"Black Sea · near Novorossiysk" },
      summary:{
        th:"ปธน.เซเลนสกีระบุกองกำลังยูเครนโจมตีเรือบรรทุกน้ำมันกองเรือเงา 2 ลำใกล้ทางเข้าท่าโนโวรอสซีสค์ และอ้างโจมตีอีกลำในทะเลบอลติก ต่อเนื่องจากการโจมตีเรือ Marquise ด้วยโดรนผิวน้ำเมื่อ 26 เม.ย. สะท้อนการขยายเป้าหมายไปยังเรือลำเลียงน้ำมันเพื่อตัดรายได้",
        en:"President Zelenskyy said Ukrainian forces struck two shadow-fleet tankers near the entrance to Novorossiysk and claimed another hit in the Baltic, following the April 26 USV strike on the tanker Marquise — widening the targeting of oil-carrying vessels to deny revenue." },
      tags:["Shadow fleet","USV","Black Sea","Sanctions evasion"],
      source:{ outlet:"Seatrade Maritime", url:"https://www.seatrade-maritime.com/security/shadow-fleet-attacks-widen-maritime-risks-around-russia" },
    },
    {
      id:"INC-3030", sev:"high", cat:"SUBSEA CABLE", srcKey:"BAS",
      time:"Dec 31", ago:{th:"คดีดำเนินอยู่", en:"under investigation"}, region:{th:"ทะเลบอลติก / อ่าวฟินแลนด์", en:"Baltic / Gulf of Finland"},
      lat:60.0, lon:24.5, vessel:"V-BL01", conf:4,
      title:{ th:"ฟินแลนด์ควบคุมเรือ 'Fitburg' หลังสายเคเบิลใต้ทะเลเสียหาย",
              en:"Finland seizes vessel 'Fitburg' after undersea cable damaged" },
      area:{ th:"ทะเลบอลติก · เส้นทางเฮลซิงกิ–ทาลลินน์", en:"Baltic Sea · Helsinki–Tallinn corridor" },
      summary:{
        th:"เจ้าหน้าที่ฟินแลนด์เข้าควบคุมเรือ Fitburg และนำเข้าเทียบท่า Kantvik หลังทำสายเคเบิลใต้ทะเลเสียหาย เป็นเหตุการณ์ล่าสุดในชุดการตัดสายเคเบิลในบอลติก เชื่อมโยงกับ 'กองเรือเงา' ของรัสเซียที่ใช้หลบเลี่ยงมาตรการคว่ำบาตร การพิสูจน์ผู้กระทำผิดในทะเลหลวงยังเป็นความท้าทาย",
        en:"Finnish authorities took control of the Fitburg and escorted it to Kantvik after it damaged an undersea cable — the latest in a series of Baltic cable-cutting incidents linked to Russia's sanctions-evading 'ghost fleet.' Attribution on the high seas remains difficult." },
      tags:["Subsea cable","Ghost fleet","Baltic","Critical infrastructure"],
      source:{ outlet:"Bulletin of the Atomic Scientists", url:"https://thebulletin.org/2026/02/seabed-zero-baltic-sabotage-and-the-global-risks-to-undersea-infrastructure/" },
      recs:[
        { th:"ประสาน NATO Baltic Sentry เพิ่มการลาดตระเวนเส้นทางเคเบิล", en:"Coordinate with NATO Baltic Sentry to increase cable-route patrols." },
        { th:"ตรวจสอบเรือกองเรือเงาที่ต้องสงสัยด้วยการขึ้นตรวจ", en:"Board and inspect suspected ghost-fleet vessels." },
        { th:"เฝ้าระวัง AIS ที่ดับ/ปลอมแปลงในย่านสายเคเบิล", en:"Monitor AIS gaps/spoofing near cable corridors." },
        { th:"เตรียมชุดซ่อมสายเคเบิลและประเมินเส้นทางสำรอง", en:"Stage cable-repair assets and assess redundancy." },
      ],
    },
    {
      id:"INC-3026", sev:"high", cat:"ATTACK", srcKey:"UKMTO",
      time:"May 03", ago:{th:"แจ้งเตือน", en:"alert"}, region:{th:"ช่องแคบฮอร์มุซ / อ่าวโอมาน", en:"Strait of Hormuz / Gulf of Oman"},
      lat:25.3, lon:56.6, vessel:"V-HZ01", conf:3,
      title:{ th:"แจ้งเหตุเรือบรรทุกน้ำมันถูกวัตถุไม่ทราบชนิดทางเหนือฟูไจราห์",
              en:"Tanker reportedly hit by unknown projectiles north of Fujairah" },
      area:{ th:"อ่าวโอมาน · เหนือฟูไจราห์", en:"Gulf of Oman · north of Fujairah" },
      summary:{
        th:"UKMTO รายงานเหตุ 2 จุดในวันเดียว: เรือเทกองถูกเรือเล็กหลายลำโจมตีขณะมุ่งหน้าขึ้นเหนือผ่านช่องแคบฮอร์มุซ และเรือบรรทุกน้ำมันถูกวัตถุไม่ทราบชนิดทางเหนือฟูไจราห์ ท่ามกลางสถานการณ์ช่องแคบฮอร์มุซที่ตึงเครียดจากสงครามอิหร่าน",
        en:"UKMTO reported two incidents in one day: a bulk carrier attacked by multiple small craft while northbound through the Strait of Hormuz, and a tanker struck by unknown projectiles north of Fujairah — amid Hormuz tensions from the Iran war." },
      tags:["Hormuz","UKMTO","Small craft","Iran war"],
      source:{ outlet:"Seatrade Maritime", url:"https://www.seatrade-maritime.com/security/shadow-fleet-attacks-widen-maritime-risks-around-russia" },
    },
    {
      id:"INC-3019", sev:"medium", cat:"EEZ / SURVEY", srcKey:"DIP",
      time:"3 d", ago:{th:"3 วัน", en:"3 d"}, region:{th:"ทะเลนาตูนาเหนือ (อินโดนีเซีย)", en:"North Natuna Sea (Indonesia)"},
      lat:5.0, lon:109.2, vessel:"V-NT01", conf:4,
      title:{ th:"บาคัมลาอินโดนีเซียขับไล่เรือยามฝั่งจีนที่แทรกแซงการสำรวจในไหล่ทวีป",
              en:"Indonesia's Bakamla expels China CG vessel interfering with survey" },
      area:{ th:"ทะเลนาตูนาเหนือ · ไหล่ทวีปอินโดนีเซีย", en:"North Natuna Sea · Indonesian shelf" },
      summary:{
        th:"หน่วยความมั่นคงทางทะเลอินโดนีเซีย (บาคัมลา) ตรวจพบและขับไล่เรือยามฝั่งจีนที่เข้ารบกวนการสำรวจคลื่นไหวสะเทือนของผู้รับสัมปทาน Pertamina บนไหล่ทวีปอินโดนีเซีย จาการ์ตาระบุเป็นการแทรกแซงกิจกรรมสำรวจที่ชอบด้วยกฎหมายตาม UNCLOS",
        en:"Indonesia's maritime security agency (Bakamla) detected and expelled a China Coast Guard vessel disrupting a Pertamina-contracted seismic survey on Indonesia's continental shelf. Jakarta described it as interference in lawful survey activity under UNCLOS." },
      tags:["EEZ","UNCLOS","China CG","Energy survey"],
      source:{ outlet:"The Diplomat", url:"https://thediplomat.com/2026/02/red-lines-and-the-reshaping-of-asias-maritime-order" },
    },
    {
      id:"INC-3014", sev:"medium", cat:"PIRACY", srcKey:"UKMTO",
      time:"6 d", ago:{th:"6 วัน", en:"6 d"}, region:{th:"อ่าวเอเดน / แอ่งโซมาเลีย", en:"Gulf of Aden / Somali Basin"},
      lat:12.6, lon:48.2, vessel:"V-AD01", conf:3,
      title:{ th:"การกลับมาของโจรสลัดโซมาเลีย — เรือเล็กเข้าประชิดเรือเทกองในอ่าวเอเดน",
              en:"Somali piracy resurgence — skiff approaches bulk carrier in Gulf of Aden" },
      area:{ th:"อ่าวเอเดน", en:"Gulf of Aden" },
      summary:{
        th:"UKMTO เตือนหลังเรือเล็กและเรือประมงเข้าประชิดเรือเทกองอย่างน่าสงสัยในอ่าวเอเดน สอดคล้องกับการกลับมาตามฤดูกาลของโจรสลัดโซมาเลีย เพิ่มความเสี่ยงต่อเรือที่ผ่านน่านน้ำดังกล่าว",
        en:"UKMTO issued a warning after a skiff and a fishing vessel made a suspicious approach to a bulk carrier in the Gulf of Aden, consistent with the seasonal return of Somali piracy and raising risk for transiting ships." },
      tags:["Piracy","Gulf of Aden","Skiff","Seasonal"],
      source:{ outlet:"Seatrade Maritime", url:"https://www.seatrade-maritime.com/security/shadow-fleet-attacks-widen-maritime-risks-around-russia" },
    },
    {
      id:"INC-3008", sev:"low", cat:"INTERDICTION", srcKey:"RIV",
      time:"8 d", ago:{th:"8 วัน", en:"8 d"}, region:{th:"ทะเลแคริบเบียนตอนใต้", en:"Southern Caribbean"},
      lat:9.5, lon:-58.5, vessel:"V-GL11", conf:3,
      title:{ th:"ความเสี่ยงเรือบรรทุกน้ำมันถูกสกัด/ยึดในแคริบเบียนตอนใต้ใกล้กายอานา",
              en:"Tanker seizure/interdiction risk in southern Caribbean off Guyana" },
      area:{ th:"แคริบเบียนตอนใต้ · นอกฝั่งกายอานา/เวเนซุเอลา", en:"S. Caribbean · off Guyana/Venezuela" },
      summary:{
        th:"ผู้เชี่ยวชาญด้านความเสี่ยงทางทะเลชี้แคริบเบียนตอนใต้เป็นจุดเสี่ยงปี 2026 เรือบรรทุกน้ำมันอาจถูกกองทัพเรือสหรัฐฯ สกัด โดยมีกำลังทางเรือสหรัฐฯ ราว 25–30% ประจำการเพื่อคุ้มครองแหล่งผลิตนอกฝั่งกายอานาและกดดันทางการเมืองต่อเวเนซุเอลา",
        en:"Maritime-risk analysts flag the southern Caribbean as a 2026 hotspot: tankers could face interdiction by US naval forces, with ~25–30% of US naval assets assigned to protect Guyana offshore production and apply political pressure on Venezuela." },
      tags:["Interdiction","Caribbean","Guyana","Geopolitical"],
      source:{ outlet:"Riviera Maritime", url:"https://www.rivieramm.com/news-content-hub/news-content-hub/2026-maritime-threats-three-seas-dominate-incidents-salvage-potential-87142" },
    },
  ];

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

  return { sources, vessels, events, news, stats, sourceMix, catMix, activity24h, brief, incTimeline, recommendations };
})();
