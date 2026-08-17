-- ============================================================
--  MDA — เปิด Row Level Security บน Supabase
--
--  วิธีใช้
--    Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--    รันซ้ำได้ปลอดภัย (drop policy if exists ก่อนสร้างใหม่ทุกครั้ง)
--
--  ทำไมต้องทำ
--    หน้าเข้าสู่ระบบถูกถอดออกแล้ว ใครเปิด URL ก็ใช้แดชบอร์ดได้ และเบราว์เซอร์
--    เขียนฐานข้อมูลด้วย anon key ซึ่งเป็นคีย์สาธารณะที่อ่านได้จากซอร์สหน้าเว็บ
--    ถ้าไม่เปิด RLS ใครก็ตามที่เห็นคีย์นั้นสามารถแก้หรือลบข้อมูลทั้งฐานได้
--
--  cron ไม่ได้รับผลกระทบ
--    api/cron-news.py ใช้ SUPABASE_SERVICE_ROLE_KEY ซึ่งข้าม RLS โดยธรรมชาติ
--    การเขียนของ cron จึงทำงานเหมือนเดิมทุกประการ
-- ============================================================


-- ── 1) เปิด RLS ──────────────────────────────────────────────
-- เปิดแล้วแต่ยังไม่สร้าง policy = ปฏิเสธทุกอย่างสำหรับ anon/authenticated
-- (service_role ยังผ่านได้) จึงต้องสร้าง policy ที่ต้องการต่อทันที
alter table public.news     enable row level security;
alter table public.events   enable row level security;
alter table public.profiles enable row level security;


-- ── 2) news — อ่านได้ทุกคน เขียนไม่ได้ ────────────────────────
-- แดชบอร์ดต้องอ่านข่าวได้โดยไม่ต้องล็อกอิน
-- ส่วนการเขียนปล่อยให้เป็นหน้าที่ของ cron อย่างเดียว
--
-- ผลข้างเคียงที่ยอมรับ: pushToSupabase() ใน news-feed.jsx จะถูกปฏิเสธ
-- ฟังก์ชันนั้นเป็นแค่การแชร์แคชข่าวระหว่างเบราว์เซอร์ ไม่ใช่ทางเข้าข้อมูลหลัก
-- และมันดัก error อยู่แล้ว (console.warn) จึงไม่มีอะไรพังบนหน้าจอ
drop policy if exists news_read_all   on public.news;
drop policy if exists news_write_none on public.news;

create policy news_read_all on public.news
  for select to anon, authenticated
  using (true);


-- ── 3) events — อ่านได้ + เพิ่มได้ แต่แก้/ลบไม่ได้ ──────────────
-- ปุ่ม "เพิ่มเหตุการณ์" บนหน้าแผนที่เรียก events.insert() ด้วย anon
-- ถ้าปิดการเขียนทั้งหมด ปุ่มนั้นจะใช้ไม่ได้ จึงเปิดเฉพาะ insert
--
-- ไม่มี policy สำหรับ update/delete = ถูกปฏิเสธโดยปริยาย
-- ใครจะเพิ่มเหตุการณ์ก็ได้ แต่ไม่มีใครลบหรือแก้ของที่มีอยู่ได้
--
-- ⚠ ข้อแลกเปลี่ยน: บนเว็บสาธารณะที่ไม่มีล็อกอิน ใครก็สแปมเหตุการณ์เข้ามาได้
--   ถ้ารับความเสี่ยงนี้ไม่ได้ ให้ลบ policy events_insert_anon ทิ้ง
--   แล้วปุ่มเพิ่มเหตุการณ์จะใช้ได้เฉพาะเมื่อเพิ่ม auth กลับมา
drop policy if exists events_read_all    on public.events;
drop policy if exists events_insert_anon on public.events;

create policy events_read_all on public.events
  for select to anon, authenticated
  using (true);

create policy events_insert_anon on public.events
  for insert to anon, authenticated
  with check (true);


-- ── 4) profiles — เห็นเฉพาะแถวของตัวเอง ────────────────────────
-- ตารางนี้เก็บชื่อ ยศ ตำแหน่งของผู้ใช้ ซึ่งเป็นข้อมูลบุคคล
-- ถึงจะถอดหน้าล็อกอินออกแล้ว ก็ไม่ควรเปิดให้ anon อ่านรายชื่อทั้งหมด
-- ผู้ที่มี session จริงยังอ่านโปรไฟล์ตัวเองได้ (app.jsx buildAppUser ใช้ตรงนี้)
drop policy if exists profiles_read_own   on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ── 5) ตรวจผล ────────────────────────────────────────────────
-- รันส่วนนี้แล้วอ่านผล: rls_enabled ต้องเป็น true ทั้งสามตาราง
select
  c.relname                             as ตาราง,
  c.relrowsecurity                      as rls_enabled,
  coalesce(count(p.polname), 0)         as จำนวน_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('news', 'events', 'profiles')
group by c.relname, c.relrowsecurity
order by c.relname;
