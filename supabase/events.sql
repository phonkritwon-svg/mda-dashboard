-- ============================================================
-- MDA — ตาราง events (เหตุการณ์/เหตุการณ์ภัยคุกคาม)
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางทั้งหมด → Run
-- เหตุการณ์มาจาก 2 ทาง:
--   • cron สร้างอัตโนมัติจากข่าวภัยสูง (origin='cron', เขียนผ่าน service_role)
--   • เจ้าหน้าที่เพิ่มเองผ่านฟอร์มในแอป (origin='manual', ต้อง login)
-- ============================================================

create table if not exists public.events (
  id            text primary key,            -- "evt_..." / "evt_man_..."
  sev           text default 'medium',       -- critical | high | medium | low
  cat           text,                         -- หมวด/ภัยคุกคาม (ศรชล.)
  src_key       text,                         -- รหัสแหล่งข่าวต้นทาง (ถ้ามี)
  title_en      text,
  title_th      text,
  area_en       text,
  area_th       text,
  region_en     text,
  region_th     text,
  summary_en    text,
  summary_th    text,
  lat           double precision,
  lon           double precision,
  vessel        text,                         -- id เรือที่เกี่ยวข้อง (ถ้ามี)
  conf          int  default 3,               -- ความเชื่อมั่น 1–5
  tags          text[] default '{}',
  source_outlet text,
  source_url    text,
  resolved      boolean default false,
  origin        text default 'manual',        -- 'cron' | 'manual'
  published_at  timestamptz default now(),
  created_at    timestamptz default now()
);

create index if not exists events_published_idx on public.events (published_at desc);
create index if not exists events_sev_idx        on public.events (sev);

alter table public.events enable row level security;

-- ใครก็อ่านได้
drop policy if exists "events_public_read" on public.events;
create policy "events_public_read"
  on public.events for select using (true);

-- ผู้ใช้ที่ login แล้ว เพิ่ม/แก้เหตุการณ์เองได้ (ฟอร์มในแอป)
drop policy if exists "events_auth_insert" on public.events;
create policy "events_auth_insert"
  on public.events for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "events_auth_update" on public.events;
create policy "events_auth_update"
  on public.events for update
  using (auth.role() = 'authenticated');

-- cron เขียนผ่าน service_role key ซึ่ง bypass RLS อยู่แล้ว
-- ============================================================
-- เสร็จแล้ว — ควรเห็นตาราง events ใน Table Editor
-- ============================================================
