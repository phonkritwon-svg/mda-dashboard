# คู่มือ Deploy — MDA Maritime Domain Awareness

## ภาพรวมสถาปัตยกรรม (หลัง deploy)

```
Frontend (static)  →  Vercel  ─┐
/api/summarize.py  →  Vercel Python serverless function (แปลข่าวเป็นไทย)
                                │
RSS news  →  api.rss2json.com  ─┘  (ดึงข่าวจาก gCaptain, Safety4Sea, ฯลฯ)
```

> Phase 2 (ภายหลัง): เพิ่ม Supabase เป็น database จริง + ระบบ login

---

## Phase 1 — ขึ้น Vercel ให้มีลิงก์ใช้งานจริง

ไฟล์ทั้งหมดพร้อมแล้ว (`api/summarize.py`, `vercel.json`, `.gitignore`, git repo + commit แรก)
เหลือแค่ขั้นที่ต้อง **สมัครบัญชี** ซึ่งต้องทำเอง:

### 1. สร้าง GitHub repo แล้ว push

1. ไปที่ https://github.com/new → ตั้งชื่อ repo เช่น `mda-dashboard` → กด **Create repository** (เลือก Private ได้)
2. กลับมาที่เครื่อง รันคำสั่ง (เปลี่ยน `<USERNAME>` เป็นชื่อ GitHub ของคุณ):

```powershell
cd "C:\Users\RTN-2\Desktop\AI horng kor"
git remote add origin https://github.com/<USERNAME>/mda-dashboard.git
git branch -M main
git push -u origin main
```

> ครั้งแรกจะให้ login GitHub ผ่านเบราว์เซอร์ — ทำตามได้เลย

### 2. เชื่อม Vercel กับ repo

1. ไปที่ https://vercel.com → **Sign up** (เลือก **Continue with GitHub** จะง่ายสุด)
2. กด **Add New… → Project**
3. เลือก repo `mda-dashboard` ที่เพิ่ง push → กด **Import**
4. **Framework Preset**: เลือก **Other** (เพราะเป็น static + Python function)
5. กด **Deploy** — รอ ~1 นาที จะได้ลิงก์ `https://mda-dashboard.vercel.app`

### 3. (เสริม) ใส่ Claude API key ให้สรุปข่าวดีขึ้น

ถ้ามี key อยากใช้ Claude แทน Google Translate:
- Vercel → Project → **Settings → Environment Variables**
- เพิ่ม `ANTHROPIC_API_KEY` = `sk-ant-...` → **Save** → **Redeploy**
- ถ้าไม่ใส่ ระบบใช้ Google Translate ฟรีอัตโนมัติ (ใช้งานได้ปกติ)

---

## รันในเครื่อง (local dev)

```powershell
cd "C:\Users\RTN-2\Desktop\AI horng kor"
python server.py            # ใช้ Google Translate ฟรี
python server.py --key sk-ant-...   # ใช้ Claude
```
เปิด http://localhost:7432

---

## Phase 2 — Supabase (database จริง) [ยังไม่ทำ]

จะเพิ่มภายหลัง:
- ตาราง `news` (เก็บข่าวส่วนกลาง แทน localStorage)
- ตาราง `incidents`, `vessels`
- Supabase Auth (เอาหน้าสมัคร/login จริงกลับมา)
- frontend คุยกับ Supabase ผ่าน JS client ตรงๆ
