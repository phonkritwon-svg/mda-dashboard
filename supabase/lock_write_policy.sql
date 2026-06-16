-- ============================================================
-- ล็อกสิทธิ์เขียนตาราง news ให้ปลอดภัยขึ้น
-- หลังจากมี cron ฝั่ง server (service_role) เขียนข่าวแล้ว
-- → ปิดสิทธิ์เขียนของ anon (frontend) เหลือแค่ "อ่าน"
-- วิธีรัน: Supabase → SQL Editor → New query → วาง → Run
--
-- ⚠️ รันหลังจากยืนยันว่า /api/cron-news เขียนข่าวได้แล้วเท่านั้น
-- ============================================================

-- 1) ปิดสิทธิ์เขียนของ anon (เหลือแต่ news_public_read ที่อ่านได้)
drop policy if exists "news_anon_insert" on public.news;
drop policy if exists "news_anon_update" on public.news;

-- 2) ล้างข่าวสด/ขยะเดิม (ที่ frontend เคยเขียน + test row) เพื่อให้ cron
--    เขียนชุดใหม่ที่สะอาด (id อิงจาก URL ของข่าว)
delete from public.news where is_live = true;

-- เสร็จแล้ว: ตาราง news จะมีแค่ข่าวที่ cron (service_role) เขียนเท่านั้น
-- frontend อ่านได้อย่างเดียว — service_role ยัง bypass RLS เขียนได้ตามปกติ
