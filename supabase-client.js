/* ============================================================
   Supabase client — เริ่มต้นการเชื่อมต่อฐานข้อมูลกลาง

   anon key ด้านล่างเป็นคีย์สาธารณะโดยการออกแบบ ใครเปิดซอร์สหน้าเว็บก็เห็น
   มันปลอดภัย "ก็ต่อเมื่อ" เปิด Row Level Security บนตารางแล้วเท่านั้น —
   ไม่ใช่ปลอดภัยโดยตัวมันเอง คอมเมนต์เดิมเขียนราวกับว่ารับประกันไว้แล้ว

   นโยบายที่ต้องรันอยู่ในไฟล์ supabase-rls.sql (รันผ่าน SQL Editor)
   ตรวจสถานะได้ด้วยคิวรีท้ายไฟล์นั้น — rls_enabled ต้องเป็น true ทุกตาราง
   ============================================================ */
(function () {
  var SUPABASE_URL  = "https://wvzukabahyylndnojhvr.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2enVrYWJhaHl5bG5kbm9qaHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTc5ODQsImV4cCI6MjA5NzEzMzk4NH0.9j200kElXvhKJ5rkOI5rz1Rxi7M1wk1brI1ZsqY4gWg";

  if (window.supabase && window.supabase.createClient) {
    window.MDA_SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    console.log("[MDA] Supabase connected");
  } else {
    console.warn("[MDA] Supabase SDK not loaded — running in offline mode");
    window.MDA_SB = null;
  }
})();
