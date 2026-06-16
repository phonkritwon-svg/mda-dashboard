-- ============================================================
-- MDA Maritime Domain Awareness — Supabase schema
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางทั้งหมด → Run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ตาราง news : ข่าวส่วนกลาง (แทน localStorage เดิม)
-- ────────────────────────────────────────────────────────────
create table if not exists public.news (
  id            text primary key,          -- "live_GCAP_..." หรือ "INC-3041"
  src_key       text,                       -- รหัสแหล่งข่าว (GCAP, ME, ...)
  outlet        text,                       -- ชื่อแหล่งข่าวที่แสดง
  category      text default 'MARITIME',
  title_en      text,
  title_th      text,                       -- หัวข้อแปลไทย
  summary_en    text,
  summary_th    text,                       -- สรุปแปลไทย
  url           text,
  reliability   text default 'B',           -- Admiralty A–F
  credibility   text default '2',           -- Admiralty 1–5
  verdict       text default 'unverified',
  linked_inc    text,                       -- เชื่อมเหตุการณ์ INC-xxxx
  is_live       boolean default true,
  published_at  timestamptz,                -- เวลาข่าวต้นฉบับ
  fetched_at    timestamptz default now(),  -- เวลาที่ดึงเข้าระบบ
  created_at    timestamptz default now()
);

create index if not exists news_published_idx on public.news (published_at desc);
create index if not exists news_srckey_idx    on public.news (src_key);

alter table public.news enable row level security;

-- ใครก็อ่านข่าวได้ (anon + ผู้ใช้ที่ login)
drop policy if exists "news_public_read" on public.news;
create policy "news_public_read"
  on public.news for select
  using (true);

-- การ "เขียน" ข่าว ทำผ่าน service_role key (ฝั่ง cron) เท่านั้น
-- service_role bypass RLS อยู่แล้ว จึงไม่ต้องสร้าง insert/update policy


-- ────────────────────────────────────────────────────────────
-- ตาราง profiles : ข้อมูลผู้ใช้ (ผูกกับ Supabase Auth)
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  full_name   text,
  rank        text,
  role        text default 'Operator',
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read"
  on public.profiles for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);


-- ────────────────────────────────────────────────────────────
-- สร้าง profile อัตโนมัติเมื่อมีผู้สมัครสมาชิกใหม่
-- (อ่านข้อมูล ชื่อ/ยศ จาก metadata ตอน sign up)
-- ────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, rank, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'rank',
    coalesce(new.raw_user_meta_data->>'role', 'Operator')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- เสร็จแล้ว — ควรเห็นตาราง news + profiles ใน Table Editor
-- ============================================================
