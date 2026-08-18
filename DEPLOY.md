# คู่มือ Deploy — MDA Maritime Domain Awareness

## สถาปัตยกรรมจริง ณ ตอนนี้

```
หน้าเว็บ (static: index.html + *.jsx คอมไพล์ในเบราว์เซอร์ด้วย Babel)
   │
   ├─→ Supabase  (ตาราง news / events / profiles + Auth)   ← เรียกตรงจากเบราว์เซอร์
   ├─→ Digitraffic REST (ตำแหน่งเรือ AIS จริง)              ← เรียกตรง เปิด CORS
   │
   └─→ Vercel Python serverless functions
          /api/summarize   แปล/ย่อข่าวเป็นไทย
          /api/analyze     วิเคราะห์เหตุการณ์
          /api/chat        ถาม-ตอบ
          /api/rss         ดึง RSS (เลี่ยงปัญหา CORS)
          /api/cron-news   ดูดข่าวเข้า Supabase (cron รายวัน)
```

> ⚠️ **`mda-dashboard.vercel.app` ใช้ไม่ได้** — ชื่อนี้ถูกโปรเจกต์ของคนอื่นจองไปแล้ว
> URL จริงจะเป็นชื่อที่ Vercel สุ่มต่อท้ายให้ตอน import เช่น `mda-dashboard-xxxx.vercel.app`

---

## ตัวแปรลับที่ต้องตั้งบน Vercel

ตั้งที่ **Project → Settings → Environment Variables** (เลือก Production + Preview ทั้งคู่)

| ตัวแปร | จำเป็น | ใช้ที่ไหน | ค่า / ที่มา |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ควรใส่ | `api/summarize.py`, `api/analyze.py`, `api/chat.py` | https://console.anthropic.com/settings/keys<br>ถ้าไม่ใส่ ระบบยังรันได้ แต่ถอยไปใช้ Google Translate + วิเคราะห์โหมด offline |
| `SUPABASE_URL` | **ต้องใส่** | `api/cron-news.py` | `https://wvzukabahyylndnojhvr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **ต้องใส่** | `api/cron-news.py` | Supabase → Settings → API → `service_role` |
| `CRON_SECRET` | ควรใส่ | `api/cron-news.py` | สุ่มสตริงยาว ๆ เอง เช่น `openssl rand -hex 32` |

**`CRON_SECRET` ทำอะไร** — ถ้าไม่ตั้ง ใครก็ยิง `/api/cron-news` ให้ทำงานได้ ถ้าตั้งไว้ ฟังก์ชันจะเช็ก
header `Authorization: Bearer <ค่า>` ก่อนรัน และ Vercel จะแนบ header นี้ให้ cron ของตัวเองอัตโนมัติ
(ใช้ชื่อตัวแปรเดียวกันพอดี) จึงทำงานเข้ากันโดยไม่ต้องตั้งอะไรเพิ่ม

**`SUPABASE_SERVICE_ROLE_KEY` ข้าม RLS ได้ทั้งหมด** — ใส่ได้เฉพาะฝั่งเซิร์ฟเวอร์เท่านั้น
ห้ามหลุดไปอยู่ในไฟล์ `.jsx` / `.js` ที่เบราว์เซอร์โหลด

### ตัวที่ **ไม่ต้อง** ใส่บน Vercel

- **`AISSTREAM_API_KEY`** — `ais.py` ต่อ AISStream ด้วย WebSocket ซึ่ง serverless ถือ connection
  ค้างไม่ได้ บน production หน้าเว็บจึงเรียก Digitraffic REST ตรงแทน (ดู `ais-live.jsx`)
  คีย์นี้ใช้เฉพาะตอนรัน `python server.py` ในเครื่อง
- **Supabase URL + anon key ฝั่งหน้าเว็บ** — hardcode อยู่ใน `supabase-client.js` แล้ว
  anon key เป็นคีย์สาธารณะโดยการออกแบบ ปลอดภัยเพราะเปิด RLS ไว้ (ดู `supabase-rls.sql`)

---

## ขั้นตอน Deploy

### 1. Import project เข้า Vercel

1. https://vercel.com → **Add New… → Project**
2. เลือก repo `phonkritwon-svg/mda-dashboard` → **Import**
3. **Framework Preset**: `Other` — ห้ามเลือก Next.js/Vite
   (โปรเจกต์นี้ไม่มีขั้นตอน build ทั้ง Build Command และ Output Directory ปล่อยว่างไว้)
4. กาง **Environment Variables** ใส่ 4 ตัวจากตารางข้างบน **ก่อน**กด Deploy
5. **Deploy** → รอ ~1 นาที

### 2. เช็กว่าขึ้นจริง

```bash
curl -sI https://<URL-ที่ได้>/ | head -1          # ต้องได้ 200
curl -s  https://<URL-ที่ได้>/api/rss | head -c 200
```

เปิดหน้าเว็บแล้วดู console ต้องเห็น `[MDA] Supabase connected`

### 3. ตรวจ cron

Vercel → Project → **Cron Jobs** ต้องเห็น `/api/cron-news` ตารางเวลา `0 0 * * *`
กด **Run** ทดสอบได้เลย แล้วดู Logs ว่าตอบ `upsert_status: 2xx`

> Cron ของ Vercel ทำงานซ้ำกับ GitHub Action `Daily News Ingest`
> (`.github/workflows/daily-news.yml` รัน 07:00 UTC ทุกวัน) — งานเดียวกันเป๊ะ
> **ไม่เสียหาย** เพราะ id ข่าวเป็น sha1 ของลิงก์ + upsert แบบ `merge-duplicates`
> ข่าวซ้ำถูกรวม ไม่งอก ถ้าอยากตัดความซ้ำซ้อน ลบอันใดอันหนึ่งทิ้งได้ตามสะดวก
> (ลบ `crons` ใน `vercel.json` หรือลบไฟล์ workflow)

---

## รันในเครื่อง (local dev)

```powershell
cd "C:\Users\RTN-2\Desktop\AI horng kor"
copy .env.example .env      # แล้วใส่คีย์ลงไป
python server.py
```

เปิด http://localhost:7432

`server.py` อ่าน `.env` ข้าง ๆ ตัวเองอัตโนมัติ ถ้าไม่มี `ANTHROPIC_API_KEY`
จะถอยไปใช้ Google Translate ฟรี ใช้งานได้ปกติ

---

## ฐานข้อมูล Supabase (ตั้งไว้แล้ว)

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/schema.sql` | ตาราง `news`, `profiles` |
| `supabase/events.sql` | ตาราง `events` |
| `supabase-rls.sql` | **นโยบาย RLS ทุกตาราง — ต้องรันแล้วเท่านั้น anon key ถึงจะปลอดภัย** |
| `supabase/news_write_policy.sql`<br>`supabase/lock_write_policy.sql` | สิทธิ์เขียน |
| `supabase/realtime_enable.sql` | เปิด realtime |

รันผ่าน Supabase → **SQL Editor** ตรวจสถานะด้วยคิวรีท้ายไฟล์ `supabase-rls.sql`
— `rls_enabled` ต้องเป็น `true` ทุกตาราง
