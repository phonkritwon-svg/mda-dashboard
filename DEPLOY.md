# คู่มือ Deploy — MDA Maritime Domain Awareness

## สถาปัตยกรรมจริง ณ ตอนนี้

```
หน้าเว็บ (static: index.html + *.jsx คอมไพล์ในเบราว์เซอร์ด้วย Babel)
   │
   ├─→ Supabase  (news / events / profiles / vessels + Auth)  ← เรียกตรงจากเบราว์เซอร์
   ├─→ Digitraffic REST (เรือ AIS บอลติก)                    ← เรียกตรง เปิด CORS
   │
   ├─→ GitHub Actions
   │      daily-news.yml   ดูดข่าวเข้า Supabase (รายวัน)
   │      ais-vessels.yml  เก็บตำแหน่งเรือ AIS อาเซียนเข้า Supabase (ทุก 30 นาที)
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

- **`AISSTREAM_API_KEY`** — serverless ถือ WebSocket ค้างไม่ได้ คีย์นี้จึงไม่มีประโยชน์บน Vercel
  แต่ **ต้องใส่ใน GitHub Secrets** เพราะ `ais_collect.py` ใช้ (ดูหัวข้อ AIS ท้ายไฟล์)
  ตอนรัน `python server.py` ในเครื่องก็ใช้คีย์นี้จาก `.env`
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
| `supabase/vessels.sql` | ตาราง `vessels` + RLS (ตำแหน่งเรือ AIS) |
| `supabase-rls.sql` | **นโยบาย RLS ทุกตาราง — ต้องรันแล้วเท่านั้น anon key ถึงจะปลอดภัย** |
| `supabase/news_write_policy.sql`<br>`supabase/lock_write_policy.sql` | สิทธิ์เขียน |
| `supabase/realtime_enable.sql` | เปิด realtime |

รันผ่าน Supabase → **SQL Editor** ตรวจสถานะด้วยคิวรีท้ายไฟล์ `supabase-rls.sql`
— `rls_enabled` ต้องเป็น `true` ทุกตาราง

---

## AIS — เรืออาเซียนขึ้นบนเว็บจริงได้อย่างไร

### ทำไมต้องอ้อมผ่าน Supabase

`ais.py` เปิด WebSocket ค้างไว้แล้วสะสมตำแหน่งเรือในหน่วยความจำ ซึ่ง serverless
ทำไม่ได้ — Vercel function มีอายุไม่กี่วินาทีและไม่แชร์หน่วยความจำกัน

> ⚠️ `/api/vessels` **ไม่เคยมีอยู่บน Vercel** — มีแต่ใน `server.py` สำหรับรันในเครื่อง
> บนลิงก์จริงจึงไม่เคยมีเรือขึ้นเลยนับตั้งแต่แรก

### ทางแก้ที่ใช้อยู่

```
GitHub Actions (ทุก 30 นาที)
   └─ ais_collect.py — เปิดสตรีม ~50 วิ → upsert ลงตาราง vessels
                                       ↓
หน้าเว็บ — useLiveVessels() อ่านจาก Supabase ทุก 60 วิ
```

ตำแหน่งเก่าได้ถึง ~30 นาที เหมาะกับภาพรวมสถานการณ์ ไม่ใช่การติดตามเรือแบบวินาทีต่อวินาที
ถ้าต้องการสดจริง ต้องย้าย `ais.py` ไปรันเป็น worker ถาวรบน host ที่ถือ process ได้

หน้าเว็บเลือกแหล่งเอง: ยิง `/api/vessels` ก่อน ถ้าติด (รันในเครื่อง) ใช้ค่าจากสตรีมสด
ถ้า 404 (บน Vercel) อ่านจาก Supabase แทน — ตรวจครั้งเดียวตอนเริ่มแล้วจำไว้

### ติดตั้งครั้งแรก

1. Supabase → SQL Editor → รัน `supabase/vessels.sql` ทั้งไฟล์
2. GitHub → Settings → Secrets → Actions → เพิ่ม `AISSTREAM_API_KEY`
   (ต้องมี `SUPABASE_URL` กับ `SUPABASE_SERVICE_ROLE_KEY` อยู่แล้วด้วย)
3. Actions → **AIS Vessels Collect** → **Run workflow** ทดสอบรอบแรก

### ถ้า workflow ล้มด้วย 429

AISStream ให้ **1 connection ต่อคีย์** ถ้ามีอีกโปรเซสถือคีย์เดียวกันอยู่
(เช่น `python server.py` ที่เปิดค้างไว้ในเครื่อง) หรือต่อถี่เกินไป จะโดน 429 ทั้งสองฝั่ง
— ปิดตัวที่ค้างอยู่ก่อนแล้วรอหน้าต่างลงโทษหมด

`concurrency` ใน workflow กันสองรอบทับกันไว้แล้ว แต่กันโปรเซสนอก GitHub ไม่ได้
