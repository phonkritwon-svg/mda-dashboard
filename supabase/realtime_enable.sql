-- ============================================================
-- เปิด Supabase Realtime ให้ตาราง news + events
-- รันครั้งเดียวใน Supabase Dashboard → SQL Editor → New query → Run
-- ทำให้ข่าว/เหตุการณ์ใหม่ "เด้ง" เข้าหน้าจอทันที (~1 วินาที) โดยไม่ต้องรอรอบ poll
-- (Row Level Security เดิมยังบังคับใช้: อ่านได้เฉพาะตาม policy public_read)
-- ============================================================

-- เพิ่มตารางเข้า publication ของ Realtime (กันซ้ำด้วย DO block)
do $$
begin
  begin
    alter publication supabase_realtime add table public.news;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.events;
  exception when duplicate_object then null;
  end;
end $$;

-- ตรวจสอบว่าเพิ่มแล้ว
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('news', 'events');
