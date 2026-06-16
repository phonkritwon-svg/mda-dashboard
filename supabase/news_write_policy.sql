-- ============================================================
-- เพิ่ม policy ให้ฝั่ง client (anon) เขียนข่าวลงตาราง news ได้
-- (ชั่วคราว — Phase 2 ขั้นต่อไปจะย้ายการเขียนไปฝั่ง server/cron แล้วลบ policy นี้)
-- วิธีรัน: Supabase → SQL Editor → New query → วาง → Run
-- ============================================================

drop policy if exists "news_anon_insert" on public.news;
create policy "news_anon_insert"
  on public.news for insert
  with check (true);

drop policy if exists "news_anon_update" on public.news;
create policy "news_anon_update"
  on public.news for update
  using (true) with check (true);
