/* ============================================================
   หน่วยงานกองทัพเรือ — สำหรับหน้าจอ "มอบหมายเหตุการณ์"

   ที่มา: https://www.navy.mi.th/organization  (ดึงเมื่อ 2026-08-25)

   เก็บเฉพาะหน่วยที่มีอีเมลเผยแพร่ — 27 หน่วยงาน จาก 45 หน่วยบนเว็บต้นทาง
   อีก 18 หน่วยถูกตัดออกเพราะเว็บใส่ "-" ไว้ในช่องอีเมล มอบหมายไม่ได้อยู่แล้ว

   สองหมวดหายไปทั้งหมวดเพราะไม่มีหน่วยไหนเผยแพร่อีเมลเลย:
     • หน่วยงานย่อยส่วนยุทธบริการ (5 หน่วย)
     • หน่วยงานย่อยส่วนบัญชาการ (1 หน่วย)
   เหลือ 7 หมวด

   ⚠ กรมยุทธการทหารเรือ: เว็บต้นทางระบุ rahoh43439@sunetoa.com ซึ่งไม่ใช่
     โดเมน navy.mi.th และมีลักษณะเป็นอีเมลชั่วคราว — ทำ suspect: true ไว้
     หน้าเว็บจะเตือนก่อนใช้ ห้ามส่งจนกว่าจะยืนยันกับหน่วยงานโดยตรง

   วิธีอัปเดต: เปิด URL ข้างบน ดูว่ามีหน่วยเพิ่ม/อีเมลเปลี่ยนไหม แล้วแก้ไฟล์นี้
   ตรง ๆ ไม่มีการดึงอัตโนมัติ เพราะเว็บกองทัพเรือไม่มี API และการ scrape
   ทุกครั้งที่เปิดหน้าเว็บจะช้าและพังทันทีที่เขาเปลี่ยนโครงสร้าง HTML
   ============================================================ */
(function () {
  const U = (name, email, tel, web, extra) =>
    Object.assign({ name, email: email || "", tel: tel || "", web: web || "" }, extra || {});

  window.MDA_NAVY_UNITS = [
    {
      cat: "ส่วนบัญชาการ",
      units: [
        U("สำนักงานเลขานุการกองทัพเรือ", "relation@navy.mi.th", "0 2475 5184", "http://www.navy.mi.th/site/sctr"),
        U("สำนักงานปลัดบัญชีทหารเรือ", "onc@navy.mi.th", "02 418 0320", "https://onc.navy.mi.th"),
        U("กรมกำลังพลทหารเรือ", "sarayout.siri@navy.mi.th", "02-475-4670", "https://person.navy.mi.th/"),
        U("กรมข่าวทหารเรือ", "nid.rtn@gmail.com", "02 475 4680", "https://www.n2.navy.mi.th/"),
        U("กรมยุทธการทหารเรือ", "rahoh43439@sunetoa.com", "02 466 9430", "https://oper.navy.mi.th/", { suspect: true }),
      ],
    },
    {
      cat: "ส่วนกำลังรบ",
      units: [
        U("กองเรือยุทธการ", "civilfleet@navy.mi.th", "038-439479", "https://www.fleet.navy.mi.th/"),
        U("ทัพเรือภาคที่ ๑", "saraban_mod0516@navy.mi.th", "", "http://www.nac1.navy.mi.th/"),
        U("ทัพเรือภาคที่ ๒", "saraban_mod0517@navy.mi.th", "0 7432 5804", "https://www.nac2.navy.mi.th/"),
        U("ทัพเรือภาคที่ ๓", "saraban_mod0518@navy.mi.th", "0 7639 1590", "https://nac3.navy.mi.th/"),
        U("หน่วยบัญชาการนาวิกโยธิน", "saraban_mod0519@navy.mi.th", "", "https://www.marines.navy.mi.th/"),
        U("หน่วยบัญชาการต่อสู้อากาศยานและรักษาฝั่ง", "saraban_mod0520@navy.mi.th", "038 431477", "https://www.acdc.navy.mi.th/"),
      ],
    },
    {
      cat: "ส่วนการศึกษาและวิจัย",
      units: [
        U("กรมยุทธศึกษาทหารเรือ", "saraban_mod0534@navy.mi.th", "02 475 3410", "http://www.navedu.navy.mi.th/"),
        U("โรงเรียนนายเรือ", "rtna@navy.mi.th", "02 394 0441", "https://www.rtna.ac.th/"),
        U("สำนักงานวิจัยและพัฒนาการทางทหารกองทัพเรือ", "nrdotech@navy.mi.th", "02-475-7205", "https://nrdo.navy.mi.th/"),
      ],
    },
    {
      cat: "ส่วนยุทธบริการ",
      units: [
        U("กรมอู่ทหารเรือ", "sarabun_mod0524@navy.mi.th", "0-3843-2335", "https://www.dockyard.navy.mi.th/"),
        U("กรมอิเล็กทรอนิกส์ทหารเรือ", "wichi.p@navy.mi.th", "02 475 6544", "https://elecs.navy.mi.th/"),
        U("กรมช่างโยธาทหารเรือ", "wichai.y@navy.mi.th", "02 475 5585", ""),
        U("กรมสรรพาวุธทหารเรือ", "saraban_mod0527@navy.mi.th", "", "https://ordn.navy.mi.th/"),
        U("กรมพลาธิการทหารเรือ", "theerapong.in@navy.mi.th", "", "https://www.supply.navy.mi.th/"),
        U("กรมแพทย์ทหารเรือ", "itmid52964@nmd.go.th", "02 475 2600", "https://www.nmd.go.th/"),
      ],
    },
    {
      cat: "หน่วยเฉพาะกิจ",
      units: [
        U("หน่วยเรือรักษาความสงบเรียบร้อยตามลำแม่น้ำโขง", "saraban_mod0541@navy.mi.th", "042-511-205", "https://mru.navy.mi.th/"),
        U("กองบัญชาการป้องกันชายแดนจันทบุรีและตราด", "ctbdc1@navy.mi.th", "039-312-172", "https://ctbdc.navy.mi.th/"),
        U("หมวดเรือลาดตระเวนชายแดน (มชด.)", "saraban_nac1@navy.mi.th", "0 3843 8008", ""),
      ],
    },
    {
      cat: "หน่วยงานอื่น ๆ ส่วนกำลังรบ",
      units: [
        U("กองเรือฟริเกตที่ ๒", "pop.kitkit@gmail.com", "", "https://www.fleet.navy.mi.th/site/frigate2"),
        U("กองเรือดำน้ำ", "submarine_sq@navy.mi.th", "038-439117", "https://www.fleet.navy.mi.th/site/submarine"),
      ],
    },
    {
      cat: "หน่วยงานอื่น",
      units: [
        U("สำนักงานทหารเรือหญิง", "navylady.navy@gmail.com", "02-475-2767", "https://navylady.nmd.go.th/"),
        U("สนามกอล์ฟราชนาวี พลูตาหลวง", "ptlnavy1969@gmail.com", "080 209 9175", "http://www.ptlnavygolf.navy.mi.th/"),
      ],
    },
  ];

  // แบนเป็นลิสต์เดียวไว้ค้นหา — เก็บชื่อหมวดติดไปด้วยเพื่อแสดงในผลลัพธ์
  window.MDA_NAVY_UNITS_FLAT = window.MDA_NAVY_UNITS.reduce(
    (acc, g) => acc.concat(g.units.map(u => Object.assign({ cat: g.cat }, u))), []);
})();
