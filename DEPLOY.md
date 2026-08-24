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
          /api/summarize   แปลข่าวเป็นไทย — ใช้เฉพาะตอน Supabase ว่าง
                           (ปกติข่าวถูกแปลตั้งแต่ ingest แล้ว ดูหัวข้อ "ข่าวถูกแปลเป็นไทยที่ไหน")
          /api/analyze     วิเคราะห์เหตุการณ์
          /api/chat        ถาม-ตอบ
          /api/rss         ดึง RSS (เลี่ยงปัญหา CORS)
          /api/cron-news   ดูดข่าวเข้า Supabase (cron รายวัน)
```

> ⚠️ **`mda-dashboard.vercel.app` ใช้ไม่ได้** — ชื่อนี้ถูกโปรเจกต์ของคนอื่นจองไปแล้ว
> URL จริงจะเป็นชื่อที่ Vercel สุ่มต่อท้ายให้ตอน import
>
> **URL ที่ใช้อยู่จริงตอนนี้: https://mda-dashboard-xi.vercel.app/**
> (ตรวจสอบเมื่อ 2026-08-24 — ทำงานปกติ)
>
> URL เก่า `mda-dashboard-11ox.vercel.app` ถูกลบไปแล้ว ตอบ `DEPLOYMENT_NOT_FOUND`
> ถ้าเจอลิงก์นี้ค้างอยู่ที่ไหน ให้เปลี่ยนเป็นตัวข้างบน

---

## ตัวแปรลับที่ต้องตั้งบน Vercel

ตั้งที่ **Project → Settings → Environment Variables** (เลือก Production + Preview ทั้งคู่)

| ตัวแปร | จำเป็น | ใช้ที่ไหน | ค่า / ที่มา |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ควรใส่ | `api/summarize.py`, `api/analyze.py`, `api/chat.py` | https://console.anthropic.com/settings/keys<br>ถ้าไม่ใส่ **ฟีดข่าวหลักยังเป็นไทยครบเหมือนเดิม** กระทบเฉพาะหน้า "ถาม-ตอบข่าวกรอง" (แสดงข่าวที่ตรงคำค้นแทนการสรุป) และ `/api/analyze` (ถอยไปโหมด offline ซึ่งเป็นข้อความสำเร็จรูป) |
| `SUPABASE_URL` | **ต้องใส่** | `api/cron-news.py` | `https://wvzukabahyylndnojhvr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **ต้องใส่** | `api/cron-news.py` | Supabase → Settings → API → `service_role` |
| `CRON_SECRET` | ควรใส่ | `api/cron-news.py` | สุ่มสตริงยาว ๆ เอง เช่น `openssl rand -hex 32` |

> `api/cron-news.py` **ไม่ได้ใช้ `ANTHROPIC_API_KEY`** — มันแปลด้วย Google Translate อย่างเดียว
> (`.github/workflows/daily-news.yml` ยังส่งตัวแปรนี้เข้าไปอยู่ ไม่เสียหาย แต่ไม่มีผล)

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
curl -sI https://<URL-ที่ได้>/ | head -1
```

```bash
curl -s "https://<URL-ที่ได้>/api/rss?url=https%3A%2F%2Fgcaptain.com%2Ffeed%2F" | head -c 200
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://<URL-ที่ได้>/api/vessels"
```

ค่าที่ถูกต้อง:

| เส้นทาง | ต้องได้ | ถ้าไม่ได้ |
|---|---|---|
| `/` | `200` | ดู Build Logs — มักเป็นเพราะเลือก Framework Preset ผิด |
| `/api/rss?url=…` | `{"status":"ok","items":[…]}` | ถ้า `host not allowed` แปลว่าโดเมนไม่อยู่ใน `ALLOWED_HOSTS` ของ `api/rss.py` |
| `/api/vessels` | **`404`** | ถ้าได้ 200 แปลว่ามีใครเพิ่มไฟล์ `api/vessels.py` เข้ามา ซึ่งไม่ควรมี |

`/api/vessels` ต้องเป็น 404 — **นี่คือพฤติกรรมที่ถูกต้อง** ไม่ใช่ความผิดพลาด
(อ่านเหตุผลในหัวข้อ AIS ท้ายไฟล์)

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

## ข่าวถูกแปลเป็นไทยที่ไหน

เข้าใจผิดกันบ่อย — **หน้าเว็บไม่ได้เป็นคนแปล** ข่าวถูกแปลตั้งแต่ตอนดูดเข้าฐานข้อมูล

```
api/cron-news.py  ── gtranslate() ──→  เขียนลง Supabase คอลัมน์ title_th / summary_th
                                             ↓
หน้าเว็บ — rowToItem() หยิบ r.title_th || r.title_en มาแสดงเฉย ๆ
```

ผลที่ตามมา:

- แถวที่มาจาก Supabase **เป็นไทยอยู่แล้ว** ไม่ต้องเรียก `/api/summarize` เลย
- `MAX_ITEMS = 30` ใน `api/summarize.py` จึงแทบไม่มีผลจริง — มันโผล่เฉพาะตอน
  Supabase ว่างแล้วหน้าเว็บถอยไปดึง RSS สดมาแสดงชั่วคราว
- `localStorage["MDA_TRANSLATIONS_v1"]` ที่ว่างเปล่า **ไม่ใช่อาการผิดปกติ**
  มันว่างเพราะไม่มีอะไรเหลือให้แปลเพิ่ม ไม่ใช่เพราะแคชพัง

---

## ต่างจาก localhost อย่างไร (ตรวจจริงเมื่อ 2026-08-24)

`python server.py` เป็นเซิร์ฟเวอร์เต็มตัวที่อ่าน `.env` ได้ ส่วน Vercel เป็นไฟล์ static
บวก serverless function อายุไม่กี่วินาที และไม่มี `.env` — สองอย่างนี้จึงไม่มีทางเหมือนกันเป๊ะ

| จุด | localhost | บนเว็บจริง |
|---|---|---|
| ตำแหน่งเรือ | `/api/vessels` → WebSocket สด อัปเดตทุกไม่กี่วินาที | อ่าน Supabase ทุก 60 วิ ข้อมูลเก่าได้ถึง 90 นาที |
| แคช HTTP | `server.py` บังคับ `no-store` ทุก response | `/api/rss` มี `s-maxage=300` → CDN เก็บฟีด 5 นาที<br>หน้าแรกเป็น `max-age=0, must-revalidate` (ไม่ค้าง) |
| IP ที่ไปดึงฟีด | IP ในไทย | ดาต้าเซ็นเตอร์ Vercel region `sin1` (สิงคโปร์)<br>เว็บข่าวไทยอาจให้ผลไม่เท่ากัน |
| เพดานเวลา API | ไม่มี | `/api/rss` 25 วิ · `/api/cron-news` 60 วิ (ดู `vercel.json`) |
| `localStorage` | สะสมอยู่บน `localhost:7432` | แยกคนละชุดตาม origin — เปิดโดเมนใหม่ครั้งแรกจะเริ่มจากศูนย์ |
| แชทถาม-ตอบข่าวกรอง | ใช้ Claude ถ้ามีคีย์ใน `.env` | ต้องตั้ง `ANTHROPIC_API_KEY` บน Vercel ไม่งั้นแสดงข่าวที่ตรงคำค้นแทน |

**ที่ไม่ต่าง** (เคยสงสัยแล้วตรวจแล้วว่าไม่ใช่ปัญหา): หัวข้อข่าวเป็นไทยครบทั้งสองฝั่ง ·
ไม่มี mixed content · ไม่มี URL ที่ hardcode localhost ไว้ · แผนที่ใช้ CARTO ซึ่งเปิดให้ทุกโดเมน

---

## AIS — เรืออาเซียนขึ้นบนเว็บจริงได้อย่างไร

### ทำไมต้องอ้อมผ่าน Supabase

`ais.py` เปิด WebSocket ค้างไว้แล้วสะสมตำแหน่งเรือในหน่วยความจำ ซึ่ง serverless
ทำไม่ได้ — Vercel function มีอายุไม่กี่วินาทีและไม่แชร์หน่วยความจำกัน

> ⚠️ `/api/vessels` **ไม่มีอยู่บน Vercel และไม่ควรมี** — มีแต่ใน `server.py` สำหรับรันในเครื่อง
> บนลิงก์จริงเส้นนี้ตอบ 404 เสมอ ซึ่งถูกต้องแล้ว หน้าเว็บจะถอยไปอ่าน Supabase เอง
>
> **นี่ไม่ได้แปลว่าเว็บจริงไม่มีเรือ** — ก่อนมีทางแก้ด้านล่างเคยเป็นแบบนั้นจริง
> แต่ตอนนี้ผ่านแล้ว ตรวจเมื่อ 2026-08-24: หน้า "ภาพรวม" ขึ้น "เรือ AIS สด 29" ลำ
> และเห็นจุดบนแผนที่ โดยเบราว์เซอร์ยิง REST ตรงไป
> `wvzukabahyylndnojhvr.supabase.co/rest/v1/vessels`

### ทางแก้ที่ใช้อยู่

```
GitHub Actions (ทุก 30 นาที)
   └─ ais_collect.py — เปิดสตรีม ~50 วิ → upsert ลงตาราง vessels
                                       ↓
หน้าเว็บ — useLiveVessels() อ่านจาก Supabase ทุก 60 วิ
```

ตัวเก็บรันทุก 30 นาที แต่หน้าเว็บยอมรับแถวที่เก่าได้ถึง **90 นาที**
(`AIS_MAX_AGE_MIN = 90` ใน `news-feed.jsx` — เผื่อให้ตัวเก็บพลาดได้ 2 รอบก่อนถือว่าข้อมูลตาย)
ดังนั้นหมุดที่เห็นอาจเก่าได้ถึงชั่วโมงครึ่ง เหมาะกับภาพรวมสถานการณ์
ไม่ใช่การติดตามเรือแบบวินาทีต่อวินาที

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
