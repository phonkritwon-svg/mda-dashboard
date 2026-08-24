-- ────────────────────────────────────────────────────────────
-- สิทธิ์ผู้ใช้ 3 ระดับ — admin / commander / user
--
--   admin      ผู้ดูแลระบบ   เข้าถึงได้ทั้งหมด + เปลี่ยน role ของคนอื่นได้
--   commander  ผู้บัญชาการ   มอบหมายงานได้
--   user       ผู้ใช้งาน     มอบหมายงานไม่ได้ (ดูอย่างเดียว)
--
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase → SQL Editor
-- รันซ้ำได้ ไม่พัง (idempotent)
--
-- ⚠ ต้องรันหลัง supabase/schema.sql เพราะแก้ตาราง profiles ที่ไฟล์นั้นสร้าง
-- ────────────────────────────────────────────────────────────


-- ── 1. ย้ายค่าเดิมให้เข้าชุดใหม่ ────────────────────────────────
-- ของเดิม default เป็น 'Operator' ซึ่งไม่อยู่ในสามค่านี้
-- ต้องแปลงก่อนใส่ constraint ไม่งั้น constraint จะสร้างไม่ผ่าน
update public.profiles
   set role = case lower(coalesce(role, ''))
                when 'admin'      then 'admin'
                when 'commander'  then 'commander'
                when 'user'       then 'user'
                else 'user'          -- 'Operator' และค่าอื่น ๆ → user
              end;

alter table public.profiles alter column role set default 'user';

-- ── 2. บังคับให้มีได้แค่สามค่า ──────────────────────────────────
-- ไม่มี constraint = พิมพ์ผิดครั้งเดียวได้ผู้ใช้ที่ไม่มีสิทธิ์อะไรเลย
-- แล้วไล่หาสาเหตุไม่เจอ เพราะหน้าเว็บจะ fallback เป็น user เงียบ ๆ
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'commander', 'user'));


-- ── 3. ปิดช่องยกระดับสิทธิ์ตัวเอง ──────────────────────────────
-- ก่อนหน้านี้มีสองรูโหว่:
--
--   ก) trigger handle_new_user() อ่าน role จาก raw_user_meta_data
--      ซึ่งเบราว์เซอร์เป็นคนส่งมาตอน signUp() — ใครแก้ payload
--      ก็ตั้งตัวเองเป็น admin ได้ตั้งแต่วินาทีที่สมัคร
--
--   ข) policy "profiles_update_own" ยอมให้แก้แถวตัวเองทุกคอลัมน์
--      รวมถึง role — ล็อกอินแล้วยิง update ตรงก็เป็น admin ได้
--
-- ข้อ ก) แก้ด้วยการเลิกอ่าน role จาก metadata (ด้านล่าง)
-- ข้อ ข) แก้ด้วย trigger ที่กันการแก้ role โดยคนที่ไม่ใช่ admin
--        (RLS policy กำหนดสิทธิ์ระดับคอลัมน์ไม่ได้ จึงต้องใช้ trigger)

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
    -- role มาจาก metadata ไม่ได้เด็ดขาด — ผู้ใช้ใหม่เริ่มที่ 'user' เสมอ
    -- ต้องให้ admin เลื่อนขั้นให้ทีหลังเท่านั้น
    'user'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ผู้เรียกคนนี้เป็น admin หรือเปล่า
-- security definer เพื่อให้อ่าน profiles ได้โดยไม่ติด RLS ของตัวเอง
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  );
$$;


create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- role ไม่เปลี่ยน → ผ่าน (แก้ชื่อ/ยศของตัวเองได้ตามปกติ)
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- service_role (cron, สคริปต์ฝั่งเซิร์ฟเวอร์) ไม่มี auth.uid() — ปล่อยผ่าน
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    raise exception 'only an admin can change a profile role';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();


-- ── 4. ให้ admin แก้โปรไฟล์คนอื่นได้ ───────────────────────────
-- policy เดิมยอมให้แก้เฉพาะแถวตัวเอง admin จึงเลื่อนขั้นให้ใครไม่ได้เลย
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());


-- ── 5. ตั้ง admin คนแรก ────────────────────────────────────────
-- ไก่กับไข่: ต้องมี admin อยู่ก่อนถึงจะแต่งตั้ง admin ได้
-- คนแรกจึงต้องตั้งจากตรงนี้ (SQL Editor รันด้วยสิทธิ์ที่ข้าม RLS)
-- แก้อีเมลให้ตรงแล้วเอาคอมเมนต์ออก:
--
-- update public.profiles set role = 'admin'
--  where id = (select id from auth.users where email = 'you@example.com');


-- ── ตรวจผล ─────────────────────────────────────────────────────
-- select p.role, count(*) from public.profiles p group by p.role order by 1;
