-- ────────────────────────────────────────────────────────────
-- กล่องข้อความในระบบ — การมอบหมายเหตุการณ์ถึงผู้ใช้
--
-- ของเดิมกดมอบหมายแล้วเปิดโปรแกรมเมลส่งออกไปหาหน่วยงานกองทัพเรือข้างนอก
-- ตอนนี้เปลี่ยนเป็นส่งถึง "ผู้ใช้ในระบบ" แล้วเข้ากล่องข้อความในเว็บแทน
-- ข้อดีคือรู้ได้ว่าใครอ่านแล้วหรือยัง ซึ่งอีเมลออกข้างนอกไม่มีทางรู้
--
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase → SQL Editor · รันซ้ำได้ ไม่พัง
-- ⚠ ต้องรันหลัง supabase/schema.sql (ต้องมีตาราง profiles) และ
--   supabase/permissions.sql (ต้องมีฟังก์ชัน can_command)
-- ────────────────────────────────────────────────────────────

create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null,
  to_id       uuid not null references auth.users(id) on delete cascade,
  from_id     uuid          references auth.users(id) on delete set null,
  -- เก็บชื่อ ณ เวลาที่ส่ง ไม่ join กลับ profiles ตอนแสดงผล
  -- เหตุผลเดียวกับ events.escalated_by — บันทึกต้องบอกว่า "ตอนนั้นใครสั่ง"
  -- ถ้าเจ้าตัวเลื่อนยศทีหลัง ข้อความเก่าต้องไม่เปลี่ยนตาม
  to_name     text,
  from_name   text,
  -- สำเนาหัวข้อเหตุการณ์ ณ เวลาที่ส่ง — กล่องข้อความต้องอ่านรู้เรื่องได้เอง
  -- โดยไม่ต้องรอโหลดตาราง events และไม่พังถ้าเหตุการณ์ถูกลบ
  event_title text,
  event_sev   text,
  note        text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists assignments_to_idx
  on public.assignments (to_id, created_at desc);

alter table public.assignments enable row level security;


-- ── สิทธิ์ ─────────────────────────────────────────────────────

-- อ่านได้เฉพาะกล่องของตัวเอง กับสิ่งที่ตัวเองส่งออกไป
-- ไม่เปิดให้อ่านทั้งตารางเหมือน events/news เพราะนี่เป็นข้อความถึงตัวบุคคล
drop policy if exists "assignments_read_own" on public.assignments;
create policy "assignments_read_own"
  on public.assignments for select
  using (to_id = auth.uid() or from_id = auth.uid());

-- ส่งได้เฉพาะคนที่สั่งการได้ และต้องส่งในนามตัวเองเท่านั้น
-- เงื่อนไข from_id = auth.uid() สำคัญ — ไม่งั้นสวมชื่อคนอื่นส่งได้
drop policy if exists "assignments_send" on public.assignments;
create policy "assignments_send"
  on public.assignments for insert
  with check (public.can_command() and from_id = auth.uid());

-- ผู้รับแก้ได้เฉพาะแถวของตัวเอง (ใช้ทำเครื่องหมายว่าอ่านแล้ว)
drop policy if exists "assignments_mark_read" on public.assignments;
create policy "assignments_mark_read"
  on public.assignments for update
  using (to_id = auth.uid())
  with check (to_id = auth.uid());

-- ไม่มี policy สำหรับ delete — ลบไม่ได้ผ่านหน้าเว็บ
-- บันทึกการมอบหมายควรอยู่ครบ ไม่ใช่ให้ผู้รับลบทิ้งแล้วอ้างว่าไม่เคยได้รับ


-- ── กันผู้รับแก้เนื้อหาข้อความ ──────────────────────────────────
-- policy ข้างบนยอมให้ผู้รับ update แถวตัวเองทุกคอลัมน์ ซึ่งแปลว่าแก้
-- เนื้อความหรือชื่อผู้ส่งได้ด้วย — RLS กำหนดสิทธิ์ระดับคอลัมน์ไม่ได้
-- จึงต้องใช้ trigger เหมือนที่ทำกับ profiles.role/rank
create or replace function public.guard_assignment_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;                       -- service_role ปล่อยผ่าน
  end if;
  if new.id         is distinct from old.id
     or new.event_id    is distinct from old.event_id
     or new.to_id       is distinct from old.to_id
     or new.from_id     is distinct from old.from_id
     or new.to_name     is distinct from old.to_name
     or new.from_name   is distinct from old.from_name
     or new.event_title is distinct from old.event_title
     or new.event_sev   is distinct from old.event_sev
     or new.note        is distinct from old.note
     or new.created_at  is distinct from old.created_at then
    raise exception 'only read_at may be changed on an assignment';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_guard_update on public.assignments;
create trigger assignments_guard_update
  before update on public.assignments
  for each row execute function public.guard_assignment_update();


-- ── realtime (ไม่บังคับ) ───────────────────────────────────────
-- เปิดแล้วข้อความใหม่จะเด้งเข้ากล่องทันทีโดยไม่ต้องรีเฟรช
-- ถ้า publication มีตารางนี้อยู่แล้วจะ error — ครอบ exception ไว้ให้รันซ้ำได้
do $$
begin
  alter publication supabase_realtime add table public.assignments;
exception
  when duplicate_object then null;
  when undefined_object then null;   -- ยังไม่ได้เปิด realtime ในโปรเจกต์
end $$;


-- ── ตรวจผล ─────────────────────────────────────────────────────
-- view pg_policies ใช้ชื่อคอลัมน์ policyname — ส่วน polname เป็นของตาราง
-- catalog pg_policy คนละตัวกัน ใส่สลับกันจะได้ error 42703
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'assignments' order by policyname;
--
-- กล่องของตัวเอง (รันตอนล็อกอินในแอป ไม่ใช่ใน SQL Editor):
-- select event_id, from_name, created_at, read_at
--   from public.assignments order by created_at desc;
