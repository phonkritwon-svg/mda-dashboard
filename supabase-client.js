/* ============================================================
   Supabase client — เริ่มต้นการเชื่อมต่อฐานข้อมูลกลาง
   (anon key เปิดเผยได้โดยปลอดภัย เพราะมี Row Level Security ป้องกัน)
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
