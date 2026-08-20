-- ============================================================
--  MDA — ตาราง vessels (ตำแหน่งเรือ AIS อาเซียน)
--
--  วิธีใช้
--    Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--    รันซ้ำได้ปลอดภัย
--
--  ทำไมต้องมีตารางนี้
--    เดิมหน้าเว็บดึงเรือจาก /api/vessels ซึ่ง server.py เป็นคนเสิร์ฟ
--    endpoint นั้นไม่เคยมีอยู่บน Vercel เลย (ไม่มี api/vessels.py) หน้าเว็บ
--    จริงจึงไม่เคยมีเรือขึ้นสักครั้ง — มีเฉพาะตอนรัน python server.py ในเครื่อง
--
--    ais.py ย้ายไป serverless ตรง ๆ ไม่ได้ เพราะมันถือ WebSocket ค้างไว้แล้ว
--    สะสมตำแหน่งในหน่วยความจำ ส่วน Vercel function มีอายุไม่กี่วินาที
--    ทางออกคือให้ GitHub Actions เปิด WebSocket เป็นช่วงสั้น ๆ เก็บตำแหน่ง
--    มาพักไว้ที่นี่ แล้วหน้าเว็บอ่านจากตารางนี้แทน
-- ============================================================

create table if not exists public.vessels (
  -- "ais_<mmsi>" — รูปแบบเดียวกับที่ ais.py สร้าง หน้าเว็บใช้เป็น key ของหมุด
  id         text primary key,
  mmsi       bigint not null,
  name       text,

  lat        double precision not null,
  lon        double precision not null,
  course     double precision,          -- COG องศา
  sp         double precision,          -- SOG นอต
  heading    integer,                   -- true heading (อาจไม่มี)
  nav_stat   integer,                   -- navigational status ตามมาตรฐาน AIS

  -- type = หมวดที่แผนที่ใช้เลือกสี, type_raw = รหัสดิบจาก AIS
  -- เก็บทั้งคู่เพราะ "ไม่ทราบประเภท" มีสองสาเหตุ: ไม่ได้รับ ShipStaticData
  -- กับรับมาแล้วแต่แปลงไม่ได้ — สองอย่างนี้แก้คนละแบบ
  type       text default 'unknown',
  type_raw   integer,

  imo        bigint,
  dest       text,

  -- เวลาที่ได้ตำแหน่งนี้มา หน้าเว็บใช้คำนวณอายุเพื่อจางหมุดตามความเก่า
  updated_at timestamptz not null default now()
);

-- อ่านทุกครั้งจะกรองเรือเก่าทิ้งและเรียงตามความสด
create index if not exists vessels_updated_at_idx
  on public.vessels (updated_at desc);


-- ── RLS ──────────────────────────────────────────────────────
-- หน้าเว็บอ่านด้วย anon key ซึ่งเป็นคีย์สาธารณะ จึงเปิดให้อ่านอย่างเดียว
-- การเขียนเป็นหน้าที่ของ ais_collect.py ที่ถือ service_role (ข้าม RLS อยู่แล้ว)
alter table public.vessels enable row level security;

drop policy if exists vessels_read_all on public.vessels;

create policy vessels_read_all on public.vessels
  for select to anon, authenticated
  using (true);


-- ── ตรวจผล ───────────────────────────────────────────────────
select c.relname                     as table_name,
       c.relrowsecurity              as rls_enabled,
       coalesce(count(p.polname), 0) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'vessels'
group by c.relname, c.relrowsecurity;
