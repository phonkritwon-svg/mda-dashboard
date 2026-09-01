-- ────────────────────────────────────────────────────────────
-- ยืนยันยศ — ปิดช่องที่คนสมัครใหม่เลือกยศสูงแล้วสั่งการได้ทันที
--
-- ปัญหาเดิม: ยศเป็นค่าที่ผู้ใช้เลือกเองตอนสมัคร และยศชั้นสัญญาบัตร
-- ปลดล็อกสิทธิ์สั่งการ ใครเลือก "พล.ร.อ." จึงสั่งการได้ทันทีโดยไม่ต้องให้ใครอนุมัติ
--
-- หลังรันไฟล์นี้: ยศจะให้สิทธิ์ก็ต่อเมื่อ admin กดยืนยันแล้วเท่านั้น
-- ส่วน role (admin/commander) ไม่เปลี่ยน เพราะ admin เป็นคนตั้งอยู่แล้ว
--
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase → SQL Editor · รันซ้ำได้ ไม่พัง
-- ⚠ ต้องรันหลัง supabase/permissions.sql
-- ────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists rank_verified boolean not null default false;

comment on column public.profiles.rank_verified is
  'admin ยืนยันแล้วว่ายศนี้เป็นของจริง · ยศให้สิทธิ์สั่งการก็ต่อเมื่อคอลัมน์นี้เป็น true';


-- ── backfill บัญชีที่มีอยู่ก่อนหน้า ─────────────────────────────
-- ถ้าปล่อยเป็น false ทั้งหมด คนที่ใช้งานอยู่จะสั่งการไม่ได้ทันทีที่รันไฟล์นี้
-- รวมถึงคนที่กำลังรันเองด้วย จึงถือว่าบัญชีที่มีอยู่ก่อน "ผ่านการตรวจแล้ว"
-- แล้วเริ่มบังคับกับคนที่สมัครหลังจากนี้เท่านั้น
--
-- ⚠ ตั้งใจไม่ใส่ where rank is not null — บัญชีที่ยังไม่ระบุยศก็ควรได้ true
--   ไว้ก่อน เพราะถ้าภายหลัง admin ใส่ยศให้ ก็เป็นการยืนยันโดยตัว admin เองอยู่แล้ว
update public.profiles set rank_verified = true where rank_verified = false;


-- ── ใครสั่งการได้ (แทนที่ของเดิม) ───────────────────────────────
-- เพิ่มเงื่อนไข rank_verified เฉพาะเส้นทางที่ผ่านด้วยยศ
-- เส้นทาง role ไม่แตะ — admin/commander ถูกตั้งโดย admin อยู่แล้ว
--
-- ⚠ รายชื่อยศยังต้องตรงกับ OFFICER_RANKS ใน login.jsx เหมือนเดิม
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
         or (
           rank_verified
           and btrim(coalesce(rank, '')) in (
             'ร.ต.', 'ร.ท.', 'ร.อ.',
             'น.ต.', 'น.ท.', 'น.อ.',
             'พล.ร.ต.', 'พล.ร.ท.', 'พล.ร.อ.'
           )
         )
       )
  );
$$;


-- ── กันการยืนยันยศให้ตัวเอง ────────────────────────────────────
-- rank_verified เป็นคอลัมน์ที่ให้สิทธิ์ ต้องกันเท่ากับ role และ rank
-- ไม่งั้นย้ายช่องโหว่จาก "ตั้งยศเอง" ไปเป็น "ยืนยันยศให้ตัวเอง" เฉย ๆ
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  role_changed     boolean := new.role is distinct from old.role;
  rank_changed     boolean := new.rank is distinct from old.rank;
  verified_changed boolean := new.rank_verified is distinct from old.rank_verified;
begin
  if not role_changed and not rank_changed and not verified_changed then
    return new;                       -- แก้ชื่อ/username ของตัวเองได้ตามปกติ
  end if;

  if auth.uid() is null then
    return new;                       -- service_role ปล่อยผ่าน
  end if;

  if not public.is_admin() then
    if role_changed then
      raise exception 'only an admin can change a profile role';
    elsif rank_changed then
      raise exception 'only an admin can change a profile rank';
    else
      raise exception 'only an admin can verify a profile rank';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();


-- ── ยศที่ admin แก้ให้ ถือว่ายืนยันแล้วโดยอัตโนมัติ ───────────────
-- ถ้า admin เป็นคนพิมพ์ยศให้เอง การบังคับให้กดยืนยันอีกทีเป็นขั้นตอนเปล่า ๆ
-- (คนที่ไม่ใช่ admin แก้ยศไม่ได้อยู่แล้วตาม trigger ข้างบน)
create or replace function public.autoverify_admin_rank()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.rank is distinct from old.rank
     and auth.uid() is not null
     and public.is_admin()
     and new.rank_verified is not distinct from old.rank_verified then
    new.rank_verified := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_autoverify_rank on public.profiles;
create trigger profiles_autoverify_rank
  before update on public.profiles
  for each row execute function public.autoverify_admin_rank();


-- ── ตรวจผล ─────────────────────────────────────────────────────
-- select username, rank, rank_verified, role from public.profiles order by created_at;
--
-- ควรเห็น rank_verified = true ทุกแถวหลังรันครั้งแรก
-- บัญชีที่สมัครหลังจากนี้จะเป็น false จนกว่า admin จะกดยืนยันในหน้า "จัดการผู้ใช้"
--
-- select tgname from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal;
-- ต้องเห็น profiles_guard_privileges และ profiles_autoverify_rank
