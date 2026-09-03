-- ────────────────────────────────────────────────────────────
-- ตำแหน่งเหตุการณ์: สถานะ · ความมั่นใจ · หลักฐาน · การแก้ไขโดยเจ้าหน้าที่
--
-- ต่อจากการแก้บั๊ก "คำแปลสร้างตำแหน่งปลอม" (commit 1be8ff4)
-- ไฟล์นี้เพิ่มสามอย่างที่ยังขาด:
--   17. ประมวลผลตำแหน่งข่าวเก่าใหม่ได้ (คอลัมน์รองรับ + กันทับของที่คนแก้)
--   18. เจ้าหน้าที่แก้พิกัดเองได้ และแยกออกจากค่าที่กฎคำนวณ
--   19. บันทึกทุกการเปลี่ยนตำแหน่ง ตรวจย้อนหลังได้
--
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase → SQL Editor · รันซ้ำได้ ไม่พัง
-- ⚠ ต้องรันหลัง supabase/events.sql และ supabase/permissions.sql
-- ────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists loc_status     text,
  add column if not exists loc_confidence numeric,
  add column if not exists loc_evidence   text,
  add column if not exists loc_source     text,
  add column if not exists loc_reason     text,
  add column if not exists loc_updated_at timestamptz;

comment on column public.events.loc_status is
  'unknown | conflict | unverified | approximate | probable | verified — verified ใช้เฉพาะที่เจ้าหน้าที่ยืนยันเอง';
comment on column public.events.loc_source is
  'rule = กฎจับคู่คำคำนวณให้ · analyst = เจ้าหน้าที่แก้เอง (ห้ามให้ตัวประมวลผลอัตโนมัติทับ)';
comment on column public.events.loc_reason is
  'เหตุผลของการเปลี่ยนครั้งล่าสุด — trigger คัดลอกลงตารางบันทึกด้วย';

-- แถวเก่าที่มีพิกัดอยู่แล้วมาจากกฎ ไม่ใช่จากคน
update public.events
   set loc_source = 'rule',
       loc_status = coalesce(loc_status, case when lat is null then 'unknown' else 'unverified' end)
 where loc_source is null;


-- ── ข้อ 19: บันทึกการเปลี่ยนตำแหน่ง ────────────────────────────
-- เขียนด้วย trigger ไม่ใช่ให้หน้าเว็บเขียนเอง — หน้าเว็บลืมเขียนได้
-- หรือถูกข้ามด้วยการยิง API ตรง แต่ trigger หลบไม่ได้
create table if not exists public.event_location_audit (
  id             bigserial primary key,
  event_id       text not null,
  prev_lat       double precision,
  prev_lon       double precision,
  prev_name      text,
  prev_status    text,
  new_lat        double precision,
  new_lon        double precision,
  new_name       text,
  new_status     text,
  changed_by     uuid references auth.users(id) on delete set null,
  changed_by_name text,
  changed_source text,           -- rule | analyst
  reason         text,
  changed_at     timestamptz not null default now()
);

create index if not exists event_location_audit_evt_idx
  on public.event_location_audit (event_id, changed_at desc);

alter table public.event_location_audit enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน — ประวัติการแก้ตำแหน่งคือสิ่งที่ทุกคนในศูนย์ควรตรวจได้
drop policy if exists "loc_audit_read" on public.event_location_audit;
create policy "loc_audit_read"
  on public.event_location_audit for select
  using (auth.uid() is not null);

-- เขียนได้เฉพาะผ่าน trigger (security definer) — ไม่มี policy insert สำหรับผู้ใช้
-- และไม่มี update/delete เลย ตารางนี้ต้องต่อท้ายอย่างเดียว ลบประวัติไม่ได้


create or replace function public.log_event_location_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  who_name text;
begin
  -- ตำแหน่งไม่เปลี่ยน → ไม่ต้องบันทึก
  if new.lat is not distinct from old.lat
     and new.lon is not distinct from old.lon
     and new.loc_status is not distinct from old.loc_status then
    return new;
  end if;

  select coalesce(nullif(btrim(coalesce(p.rank, '') || ' ' || coalesce(p.full_name, '')), ''),
                  p.username)
    into who_name
    from public.profiles p
   where p.id = auth.uid();

  insert into public.event_location_audit (
    event_id, prev_lat, prev_lon, prev_name, prev_status,
    new_lat, new_lon, new_name, new_status,
    changed_by, changed_by_name, changed_source, reason)
  values (
    new.id, old.lat, old.lon, old.area_en, old.loc_status,
    new.lat, new.lon, new.area_en, new.loc_status,
    auth.uid(), who_name, coalesce(new.loc_source, 'rule'), new.loc_reason);

  new.loc_updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_log_location on public.events;
create trigger events_log_location
  before update on public.events
  for each row execute function public.log_event_location_change();


-- ── ตรวจผล ─────────────────────────────────────────────────────
-- select id, area_en, lat, lon, loc_status, loc_confidence, loc_source
--   from public.events order by published_at desc limit 20;
--
-- ประวัติการแก้ตำแหน่งล่าสุด:
-- select event_id, prev_name, new_name, changed_by_name, changed_source, reason, changed_at
--   from public.event_location_audit order by changed_at desc limit 20;
--
-- select tgname from pg_trigger where tgrelid='public.events'::regclass and not tgisinternal;
-- ต้องเห็น events_log_location
