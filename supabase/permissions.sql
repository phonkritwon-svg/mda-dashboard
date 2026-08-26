-- ────────────────────────────────────────────────────────────
-- ปิดช่องว่างระหว่าง "สิ่งที่หน้าเว็บบอก" กับ "สิ่งที่ฐานข้อมูลบังคับ"
--
--   1. กันการแก้ยศตัวเองหลังสมัคร  (ยศปลดล็อกสิทธิ์สั่งการ จึงต้องกันเท่า role)
--   2. จำกัดสิทธิ์เขียนตาราง events ให้เหลือเฉพาะคนที่สั่งการได้จริง
--
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase → SQL Editor · รันซ้ำได้ ไม่พัง
-- ⚠ ต้องรันหลัง supabase/roles.sql และ supabase/events.sql
-- ────────────────────────────────────────────────────────────


-- ── 1. ใครสั่งการได้ ───────────────────────────────────────────
-- เงื่อนไขเดียวกับ can(user, "command") ใน login.jsx:
--   role เป็น admin/commander  หรือ  ยศเป็นชั้นสัญญาบัตร (ร.ต. ขึ้นไป)
--
-- ⚠ รายชื่อยศถูกเขียนไว้สองที่ — ที่นี่กับ OFFICER_RANKS ใน login.jsx
--   ไม่มีทางให้ SQL อ่านค่าจาก JS ได้ ถ้าจะแก้รายการยศ **ต้องแก้ทั้งสองที่**
--   ไม่งั้นหน้าเว็บกับฐานข้อมูลจะไม่ตรงกัน แล้วผู้ใช้จะเห็นปุ่มที่กดแล้วพัง
create or replace function public.can_command()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (
         role in ('admin', 'commander')
         or btrim(coalesce(rank, '')) in (
           'ร.ต.', 'ร.ท.', 'ร.อ.',
           'น.ต.', 'น.ท.', 'น.อ.',
           'พล.ร.ต.', 'พล.ร.ท.', 'พล.ร.อ.'
         )
       )
  );
$$;


-- ── 2. กันการแก้ยศตัวเอง ───────────────────────────────────────
-- ก่อนหน้านี้ trigger กันเฉพาะคอลัมน์ role — พอยศเริ่มปลดล็อกสิทธิ์สั่งการ
-- ช่องนี้ก็เท่ากับยกระดับสิทธิ์ตัวเองได้เหมือนกัน แค่เปลี่ยนคอลัมน์ที่ยิง
--
-- ยศตอน "สมัคร" ยังเลือกเองได้ตามเดิม (trigger นี้เป็น BEFORE UPDATE
-- ไม่แตะ INSERT ของ handle_new_user) — ที่ปิดคือการแก้ทีหลัง
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  role_changed boolean := new.role is distinct from old.role;
  rank_changed boolean := new.rank is distinct from old.rank;
begin
  -- ไม่ได้แตะคอลัมน์ที่ให้สิทธิ์ → ผ่าน (แก้ชื่อ/username ของตัวเองได้ตามปกติ)
  if not role_changed and not rank_changed then
    return new;
  end if;

  -- service_role (cron, สคริปต์ฝั่งเซิร์ฟเวอร์) ไม่มี auth.uid() — ปล่อยผ่าน
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    if role_changed then
      raise exception 'only an admin can change a profile role';
    else
      raise exception 'only an admin can change a profile rank';
    end if;
  end if;

  return new;
end;
$$;

-- ตัวเก่าชื่อ profiles_guard_role — ต้องลบทิ้ง ไม่งั้นสอง trigger ทำงานซ้อนกัน
drop trigger if exists profiles_guard_role on public.profiles;
drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();


-- ── 3. ตาราง events: เขียนได้เฉพาะคนที่สั่งการได้ ────────────────
-- ของเดิมเปิดให้ auth.role() = 'authenticated' ซึ่งแปลว่า "ใครก็ได้ที่ล็อกอิน"
-- ตอนที่บัญชีถูกสร้างโดย admin เท่านั้นยังพอรับได้ — แต่ตอนนี้เปิดให้สมัครเอง
-- ใครมีอีเมลก็เขียน/แก้เหตุการณ์ในฐานข้อมูลปฏิบัติการร่วมได้ทันที
--
-- อ่านยังเปิดให้ทุกคนเหมือนเดิม — คนเฝ้าระวังต้องเห็นเหตุการณ์ทั้งหมด
drop policy if exists "events_auth_insert" on public.events;
drop policy if exists "events_auth_update" on public.events;
drop policy if exists "events_command_insert" on public.events;
drop policy if exists "events_command_update" on public.events;

create policy "events_command_insert"
  on public.events for insert
  with check (public.can_command());

create policy "events_command_update"
  on public.events for update
  using (public.can_command())
  with check (public.can_command());

-- ไม่มี policy สำหรับ delete = ลบไม่ได้เลยผ่าน anon/authenticated
-- ตั้งใจไว้แบบนั้น เหตุการณ์ควรถูกปิดด้วยการตั้ง resolved ไม่ใช่ลบทิ้ง
-- (service_role ยังลบได้ถ้าจำเป็น เพราะข้าม RLS)


-- ── ตรวจผล ─────────────────────────────────────────────────────
-- ต้องเห็น events_command_insert / events_command_update และไม่เห็นตัว _auth_
--
-- view pg_policies ใช้ชื่อคอลัมน์ policyname — ส่วน polname เป็นของตาราง
-- catalog pg_policy คนละตัวกัน ใส่สลับกันจะได้ error 42703
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'events' order by policyname;
--
-- เช็คว่าตัวเองสั่งการได้ไหม (รันตอนล็อกอินในแอป ไม่ใช่ใน SQL Editor
-- เพราะ SQL Editor ไม่มี auth.uid() จะได้ false เสมอ):
-- select public.can_command();
