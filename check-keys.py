"""
ตรวจว่าคีย์ในไฟล์ .env ใช้งานได้จริงหรือไม่

    python check-keys.py

สคริปต์นี้ไม่แสดงคีย์เต็ม และไม่ส่งคีย์ไปที่ไหนนอกจากผู้ให้บริการเจ้าของคีย์เอง
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ENV_PATH = Path(__file__).parent / ".env"


def load_env():
    if not ENV_PATH.exists():
        return {}
    out = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def mask(key):
    return key[:8] + "…" + key[-4:] if len(key) > 14 else "…"


def check_anthropic(key):
    """ยิงคำขอเล็กที่สุดไปที่ Messages API เพื่อดูว่าคีย์ผ่านหรือไม่"""
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 8,
        "messages": [{"role": "user", "content": "ping"}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=payload, method="POST",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            json.loads(r.read())
        return True, "ใช้งานได้ — บทวิเคราะห์เชิงลึกจะใช้ Claude แล้ว"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        if e.code == 401:
            return False, "คีย์ไม่ถูกต้องหรือถูกเพิกถอน (401) — ตรวจว่าคัดลอกครบทั้งบรรทัด"
        if e.code == 400 and "credit" in body.lower():
            return False, "คีย์ถูกต้องแต่เครดิตหมด (400) — เติมเครดิตที่ console.anthropic.com"
        if e.code == 429:
            return False, "คีย์ถูกต้องแต่ถูกจำกัดอัตราการเรียก (429) — รอสักครู่แล้วลองใหม่"
        return False, "HTTP %s — %s" % (e.code, body)
    except Exception as e:
        return False, "ต่อไม่ได้ (%s) — ตรวจอินเทอร์เน็ต/ไฟร์วอลล์" % type(e).__name__


def check_aisstream(key):
    """AISStream ไม่ส่งข้อความบอกว่าคีย์ผิด แต่จะ 'เปิดแล้วปิดเงียบ ๆ' แทน
    จึงต้องดูวงจรชีวิตของ WebSocket ว่าปิดก่อนได้ข้อมูลหรือไม่ ถึงจะแยกสาเหตุได้ถูก"""
    try:
        import websocket
    except ImportError:
        return False, "ยังไม่ได้ติดตั้ง websocket-client → pip install websocket-client"

    import threading
    ev = {"opened": False, "msg": None, "closed": False, "err": None}

    def on_open(ws):
        ev["opened"] = True
        # ขอทั้งโลกเพื่อให้มีข้อมูลไหลแน่ถ้าคีย์ผ่าน
        # "Apikey" ตามเอกสาร aisstream.io — สะกดเป็น "APIKey" แล้วโดนปิดการเชื่อมต่อ
        ws.send(json.dumps({"Apikey": key, "BoundingBoxes": [[[-90, -180], [90, 180]]]}))

    def on_message(ws, m):
        ev["msg"] = str(m)[:200]
        ws.close()

    def on_error(ws, e):
        ev["err"] = type(e).__name__

    def on_close(ws, code, reason):
        ev["closed"] = True

    app = websocket.WebSocketApp(
        "wss://stream.aisstream.io/v0/stream",
        on_open=on_open, on_message=on_message, on_error=on_error, on_close=on_close)
    t = threading.Thread(target=app.run_forever, daemon=True)
    t.start()

    waited = 0.0
    while waited < 20 and ev["msg"] is None and not ev["closed"]:
        time.sleep(0.5)
        waited += 0.5
    try:
        app.close()
    except Exception:
        pass

    if ev["msg"]:
        low = ev["msg"].lower()
        if "error" in low and "apikey" in low.replace(" ", ""):
            return False, "คีย์ถูกปฏิเสธ — " + ev["msg"][:120]
        return True, "ใช้งานได้ — เริ่มรับตำแหน่งเรือจริงแล้ว"

    if not ev["opened"]:
        return False, "ต่อไม่ถึงเซิร์ฟเวอร์ (%s) — ตรวจอินเทอร์เน็ต/ไฟร์วอลล์" % (ev["err"] or "timeout")

    if ev["closed"]:
        return False, ("เชื่อมต่อได้แต่เซิร์ฟเวอร์ปิดทันทีโดยไม่ส่งข้อมูล\n"
                       "     พบบ่อยสุด: เพิ่งต่อถี่เกินไป — AISStream ให้ 1 การเชื่อมต่อต่อคีย์\n"
                       "     ปิด server.py ให้หมด รอ 15-30 นาที แล้วรันสคริปต์นี้ครั้งเดียว\n"
                       "     ถ้ายังเหมือนเดิม: เข้า https://aisstream.io/apikeys "
                       "(ล็อกอินด้วย GitHub) ตรวจว่าคีย์ยัง active")
    return False, "เชื่อมต่อได้แต่ไม่มีข้อมูลไหลมาใน 20 วินาที — ลองใหม่อีกครั้ง"


def main():
    print("ตรวจไฟล์:", ENV_PATH)
    if not ENV_PATH.exists():
        print("  ✗ ไม่พบไฟล์ .env — คัดลอกจาก .env.example ก่อน")
        return 1

    env = load_env()
    checks = [
        ("ANTHROPIC_API_KEY", check_anthropic,
         "บทวิเคราะห์เชิงลึก + สรุปข่าวด้วย Claude"),
        ("AISSTREAM_API_KEY", check_aisstream,
         "ตำแหน่งเรือจริงบนแผนที่"),
    ]

    bad = 0
    for name, fn, purpose in checks:
        key = env.get(name, "")
        print("\n%s  (%s)" % (name, purpose))
        if not key:
            print("  – ยังไม่ได้ใส่ค่า — ระบบจะใช้โหมดสำรองแทน")
            continue
        if " " in key or key.startswith('"') or key.startswith("'"):
            print("  ✗ รูปแบบผิด: มีช่องว่างหรือเครื่องหมายคำพูดปนอยู่")
            bad += 1
            continue
        print("  คีย์ที่อ่านได้:", mask(key))
        ok, msg = fn(key)
        print(("  ✓ " if ok else "  ✗ ") + msg)
        if not ok:
            bad += 1

    print("\n" + ("เรียบร้อย — รันต่อด้วย  python server.py" if bad == 0
                  else "พบปัญหา %d รายการ แก้ตามข้อความด้านบนแล้วรันสคริปต์นี้ใหม่" % bad))
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
