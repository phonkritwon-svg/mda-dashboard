"""
AIS live feed — เชื่อมต่อ AISStream.io เพื่อรับตำแหน่งเรือจริงแบบเรียลไทม์

ทำไมต้องผ่านเซิร์ฟเวอร์ ไม่ต่อจากเบราว์เซอร์ตรง ๆ:
  AISStream ต้องใช้ API key ถ้าต่อจากหน้าเว็บ key จะโผล่ในโค้ดฝั่งผู้ใช้ทันที
  จึงให้เซิร์ฟเวอร์ถือ key ไว้ เปิด WebSocket ค้าง เก็บตำแหน่งล่าสุดในหน่วยความจำ
  แล้วหน้าเว็บมาดึงผ่าน GET /api/vessels เป็นระยะแทน

ใช้ได้เฉพาะตอนรัน server.py บนเครื่อง — ไม่ใช่โมดูลของ Vercel
  โมดูลนี้ต้องเปิด WebSocket ค้างไว้ตลอด ซึ่ง serverless function ทำไม่ได้
  (ตายทุกครั้งที่จบคำขอ) บน production จึงไม่มี /api/vessels และหน้าเว็บจะ
  แสดงสถานะ "เชื่อมต่อเซิร์ฟเวอร์ AIS ไม่ได้" แล้วใช้หมุดที่สกัดจากข่าวแทน
  จึงต้องวางไฟล์นี้ที่ root ไม่ใช่ใน api/ มิฉะนั้น Vercel จะ build เป็นฟังก์ชัน
  แล้วพังเพราะไม่มี handler

ENV: AISSTREAM_API_KEY  (ขอฟรีที่ https://aisstream.io/authenticate)
"""

import json
import os
import threading
import time

# ── พื้นที่ที่ติดตาม (ครอบคลุมน่านน้ำไทยและอาเซียน + ช่องแคบสำคัญ) ──
# รูปแบบ [[lat_ใต้, lon_ตะวันตก], [lat_เหนือ, lon_ตะวันออก]]
BOUNDING_BOXES = [
    [[-10.0, 92.0], [25.0, 128.0]],     # อ่าวไทย · อันดามัน · ทะเลจีนใต้ · มะละกา
    [[10.0, 40.0], [30.0, 60.0]],       # ทะเลแดง · อ่าวเอเดน · ฮอร์มุซ
]

MAX_VESSELS = 400        # จำกัดจำนวนเรือที่เก็บ กันหน่วยความจำบวม
STALE_SECONDS = 1800     # ตำแหน่งเก่ากว่านี้ถือว่าหมดอายุ (30 นาที)

_lock = threading.Lock()
_vessels = {}            # mmsi -> dict
_state = {"connected": False, "error": None, "started": False, "messages": 0, "since": None}


# ── แปลงรหัสประเภทเรือ AIS → ประเภทที่แผนที่ใช้ ──
def ship_type_to_kind(t):
    try:
        t = int(t)
    except (TypeError, ValueError):
        return "dark"
    if 30 <= t <= 39:
        return "fishing" if t == 30 else "navy"
    if 60 <= t <= 69:
        return "cargo"      # เรือโดยสาร — แสดงรวมกับเรือสินค้า
    if 70 <= t <= 79:
        return "cargo"
    if 80 <= t <= 89:
        return "tanker"
    if 35 in (t,) or 51 == t:
        return "navy"
    return "dark"


def _put(mmsi, patch):
    with _lock:
        v = _vessels.get(mmsi) or {"id": "ais_" + str(mmsi), "mmsi": mmsi}
        v.update(patch)
        v["updated"] = time.time()
        _vessels[mmsi] = v
        if len(_vessels) > MAX_VESSELS:
            # ตัดลำที่เก่าที่สุดออกก่อน
            oldest = sorted(_vessels.items(), key=lambda kv: kv[1].get("updated", 0))
            for k, _ in oldest[: len(_vessels) - MAX_VESSELS]:
                _vessels.pop(k, None)


def _handle(msg):
    mtype = msg.get("MessageType")
    meta = msg.get("MetaData") or {}
    mmsi = meta.get("MMSI") or meta.get("MMSI_String")
    if not mmsi:
        return
    _state["messages"] += 1

    if mtype == "PositionReport":
        pr = (msg.get("Message") or {}).get("PositionReport") or {}
        lat = pr.get("Latitude", meta.get("latitude"))
        lon = pr.get("Longitude", meta.get("longitude"))
        if lat is None or lon is None:
            return
        _put(mmsi, {
            "lat": lat, "lon": lon,
            "course": pr.get("Cog") or 0,
            "sp": round(pr.get("Sog") or 0, 1),
            "heading": pr.get("TrueHeading"),
            "navStat": pr.get("NavigationalStatus"),
            "name": (meta.get("ShipName") or "").strip() or ("MMSI " + str(mmsi)),
        })

    elif mtype == "ShipStaticData":
        sd = (msg.get("Message") or {}).get("ShipStaticData") or {}
        patch = {"type": ship_type_to_kind(sd.get("Type"))}
        if sd.get("Name"):
            patch["name"] = sd["Name"].strip()
        if sd.get("ImoNumber"):
            patch["imo"] = sd["ImoNumber"]
        dest = (sd.get("Destination") or "").strip()
        if dest:
            patch["dest"] = dest
        _put(mmsi, patch)


def snapshot():
    """คืนรายการเรือที่ยังไม่หมดอายุ พร้อมสถานะการเชื่อมต่อ"""
    now = time.time()
    with _lock:
        items = [dict(v) for v in _vessels.values()
                 if v.get("lat") is not None and now - v.get("updated", 0) < STALE_SECONDS]
    for v in items:
        v["ageSec"] = int(now - v.pop("updated", now))
        v.setdefault("type", "dark")
        v.setdefault("flag", "")
        v.setdefault("status", "normal")
    items.sort(key=lambda v: v["ageSec"])
    return {
        "ok": True,
        "connected": _state["connected"],
        "error": _state["error"],
        "count": len(items),
        "messages": _state["messages"],
        "vessels": items,
    }


def _run(api_key):
    import websocket   # websocket-client

    sub = json.dumps({
        "APIKey": api_key,
        "BoundingBoxes": BOUNDING_BOXES,
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    })

    backoff = 3
    while True:
        try:
            ws = websocket.create_connection(
                "wss://stream.aisstream.io/v0/stream", timeout=30)
            ws.send(sub)
            _state["connected"] = True
            _state["error"] = None
            _state["since"] = time.time()
            backoff = 3
            print("[MDA] AIS: เชื่อมต่อ AISStream สำเร็จ")

            while True:
                raw = ws.recv()
                if not raw:
                    break
                try:
                    _handle(json.loads(raw))
                except Exception:
                    pass
        except Exception as e:
            _state["connected"] = False
            _state["error"] = str(e)[:200]
            print("[MDA] AIS: หลุดการเชื่อมต่อ —", str(e)[:120], "· ต่อใหม่ใน", backoff, "วิ")
        finally:
            try:
                ws.close()
            except Exception:
                pass
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


def start(api_key=None):
    """เริ่มรับ AIS ในเธรดพื้นหลัง (เรียกซ้ำได้ ไม่สร้างซ้ำ)"""
    key = api_key or os.environ.get("AISSTREAM_API_KEY", "")
    if not key:
        _state["error"] = "ยังไม่ได้ตั้ง AISSTREAM_API_KEY"
        return False
    if _state["started"]:
        return True
    try:
        import websocket  # noqa: F401
    except ImportError:
        _state["error"] = "ยังไม่ได้ติดตั้ง websocket-client (pip install websocket-client)"
        print("[MDA] AIS:", _state["error"])
        return False
    _state["started"] = True
    threading.Thread(target=_run, args=(key,), daemon=True).start()
    return True
