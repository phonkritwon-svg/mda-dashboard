"""เก็บตำแหน่งเรือ AIS เป็นช่วงสั้น ๆ แล้วพักไว้ที่ Supabase

รันโดย .github/workflows/ais-vessels.yml ทุก ~30 นาที

ทำไมต้องทำแบบนี้
  ais.py ถือ WebSocket ค้างไว้แล้วสะสมตำแหน่งในหน่วยความจำ ซึ่งเป็นรูปแบบที่
  serverless รองรับไม่ได้ — Vercel function มีอายุไม่กี่วินาทีและไม่แชร์
  หน่วยความจำกัน หน้าเว็บจริงจึงไม่เคยมีเรือขึ้นเลย เพราะ /api/vessels
  มีอยู่แค่ใน server.py สำหรับรันในเครื่อง

  สคริปต์นี้ไม่ได้เขียนตรรกะ AIS ใหม่ แต่ยืม ais.py มาทั้งดุ้น: เปิดสตรีม
  รอเก็บข้อมูลตามเวลาที่กำหนด แล้ว snapshot() ออกมา upsert ลงตาราง vessels

ข้อจำกัดที่ต้องรู้
  ตำแหน่งจะเก่าได้เท่ากับระยะห่างของรอบ (~30 นาที) เหมาะกับภาพรวมสถานการณ์
  ไม่ใช่การติดตามเรือแบบวินาทีต่อวินาที ถ้าต้องการสด ๆ ต้องมี worker ถาวร

ENV ที่ต้องตั้ง
  AISSTREAM_API_KEY          คีย์ AISStream
  SUPABASE_URL               URL โปรเจกต์ Supabase
  SUPABASE_SERVICE_ROLE_KEY  คีย์ service_role (ข้าม RLS)
  COLLECT_SECONDS            (ไม่บังคับ) วินาทีที่เปิดสตรีม ค่าตั้งต้น 50
"""

import importlib.util
import json
import os
import sys
import time
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
COLLECT_SECONDS = int(os.environ.get("COLLECT_SECONDS", "50"))

# หยุดรอทันทีที่ได้เรือครบเท่านี้ — ไม่มีเหตุผลต้องถือสตรีมต่อจนหมดเวลา
ENOUGH_VESSELS = 400


def load_ais():
    """โหลด ais.py ด้วยมือ เพราะชื่อไฟล์ชนกับแพ็กเกจ ais บน PyPI"""
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location("mda_ais", os.path.join(here, "ais.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def to_row(v):
    """แปลงเรือหนึ่งลำจากรูปแบบของ ais.py เป็นคอลัมน์ของตาราง vessels

    ais.py ใช้ camelCase ส่วนตารางใช้ snake_case จึงต้องแมปตรงนี้
    ageSec ไม่ถูกเก็บ เพราะมันคำนวณจาก updated_at ได้อยู่แล้วตอนอ่าน
    """
    return {
        "id":       v.get("id"),
        "mmsi":     v.get("mmsi"),
        "name":     (v.get("name") or "")[:120] or None,
        "lat":      v.get("lat"),
        "lon":      v.get("lon"),
        "course":   v.get("course"),
        "sp":       v.get("sp"),
        "heading":  v.get("heading"),
        "nav_stat": v.get("navStat"),
        "type":     v.get("type") or "unknown",
        "type_raw": v.get("typeRaw"),
        "imo":      v.get("imo"),
        "dest":     (v.get("dest") or "")[:120] or None,
    }


def upsert(rows):
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        SUPABASE_URL.rstrip("/") + "/rest/v1/vessels",
        data=body, method="POST",
        headers={
            "apikey":        SERVICE_KEY,
            "Authorization": "Bearer " + SERVICE_KEY,
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates,return=minimal",
        })
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    if not SUPABASE_URL or not SERVICE_KEY:
        raise SystemExit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env")
    if not os.environ.get("AISSTREAM_API_KEY"):
        raise SystemExit("missing AISSTREAM_API_KEY env")

    ais = load_ais()
    if not ais.start():
        raise SystemExit("AIS start failed: " + str(ais._state.get("error")))

    deadline = time.time() + COLLECT_SECONDS
    while time.time() < deadline:
        time.sleep(2)
        snap = ais.snapshot()
        if snap.get("count", 0) >= ENOUGH_VESSELS:
            break

    snap = ais.snapshot()
    rows = [to_row(v) for v in snap.get("vessels", []) if v.get("id")]

    # ไม่มีเรือ = ล้มเหลว ไม่ใช่ "สำเร็จแต่ว่าง" — ถ้าคืน 0 เงียบ ๆ workflow
    # จะขึ้นเขียวทั้งที่คีย์โดนปฏิเสธหรือสตรีมไม่ไหล ซึ่งเป็นบั๊กแบบเดียวกับ
    # ที่ทำให้ daily-news รายงานสำเร็จมาหลายสัปดาห์โดยไม่ได้ทำอะไร
    if not rows:
        print(json.dumps({
            "ok": False, "count": 0,
            "connected": snap.get("connected"),
            "messages": snap.get("messages"),
            "error": str(snap.get("error"))[:200],
        }, ensure_ascii=False))
        raise SystemExit(1)

    status = upsert(rows)
    print(json.dumps({
        "ok": True, "count": len(rows),
        "connected": snap.get("connected"),
        "messages": snap.get("messages"),
        "upsert_status": status,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
