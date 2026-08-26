-- ────────────────────────────────────────────────────────────
-- เก็บสถานะ "ยกระดับ" ลงฐานข้อมูล
--
-- ก่อนหน้านี้การยกระดับอยู่ใน state ของหน้าจอเท่านั้น — รีเฟรชแล้วหาย
-- และคนอื่นในศูนย์ไม่เห็น ซึ่งขัดกับความหมายของมันเอง
-- การยกระดับคือการบอกทั้งศูนย์ว่าเหตุการณ์นี้สำคัญขึ้น ถ้าเห็นอยู่คนเดียว
-- ก็ไม่ได้ยกระดับอะไรเลย
--
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase → SQL Editor · รันซ้ำได้ ไม่พัง
-- ⚠ ต้องรันหลัง supabase/events.sql
-- ────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by text;

-- escalated_at เป็นตัวชี้ขาดว่ายกระดับอยู่หรือไม่ (null = ยังไม่ยกระดับ)
-- ไม่ใช้คอลัมน์ boolean แยกต่างหาก เพราะจะมีสองแหล่งความจริงให้ขัดกันเอง
-- เช่น escalated = true แต่ escalated_at เป็น null แล้วไม่มีใครรู้ว่าเชื่ออันไหน
comment on column public.events.escalated_at is
  'เวลาที่ถูกยกระดับ · null = ยังไม่ยกระดับ (เป็นตัวชี้ขาด ไม่มี flag แยก)';

-- เก็บเป็นชื่อที่แสดง ("น.ท. สมชาย ใจดี") ไม่ใช่ user id
-- ข้อดี: อ่านออกทันทีโดยไม่ต้อง join
-- ข้อเสีย: ถ้าคนนั้นเปลี่ยนยศหรือชื่อทีหลัง บันทึกเก่าจะไม่ตามไปด้วย
--          ซึ่งถูกต้องสำหรับบันทึกเหตุการณ์ — มันควรบอกว่า "ตอนนั้นใครสั่ง"
--          ไม่ใช่ "ตอนนี้คนนั้นชื่ออะไร"
comment on column public.events.escalated_by is
  'ยศ+ชื่อของผู้ยกระดับ ณ เวลาที่กด · ไม่ผูกกับ profiles จึงไม่เปลี่ยนตามภายหลัง';

-- ไม่ต้องเพิ่ม policy ใหม่ — การยกระดับคือการ update แถวเดิม
-- จึงอยู่ใต้ events_command_update ใน supabase/permissions.sql อยู่แล้ว
-- (ถ้ายังไม่ได้รันไฟล์นั้น จะยังเป็น events_auth_update ตัวเก่าที่หลวมกว่า)


-- ── ตรวจผล ─────────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'events'
--    and column_name like 'escalated%';
--
-- ดูเหตุการณ์ที่ถูกยกระดับอยู่:
-- select id, sev, escalated_by, escalated_at from public.events
--  where escalated_at is not null order by escalated_at desc;
