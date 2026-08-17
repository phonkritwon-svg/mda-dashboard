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
    """ไม่รู้ประเภท → "unknown" เท่านั้น ห้ามคืน "dark"

    บนแดชบอร์ดนี้ "dark" หมายถึงจงใจดับสัญญาณ/กองเรือเงา ซึ่งเป็นข้อกล่าวหา
    ที่หนักเกินกว่าจะสรุปจากการที่ ShipStaticData ยังมาไม่ถึง — เรือเกือบทุกลำ
    ส่ง PositionReport ก่อนข้อมูลนิ่งเสมอ ถ้าเหมารวมเป็น dark ทั้งหมด
    แผนที่จะเต็มไปด้วยสัญญาณเตือนลวงจนตัวเลข "เฝ้าระวัง" ใช้ไม่ได้

    รหัสที่ไม่เข้าหมวดใดก็คืน "unknown" เช่นกัน ดีกว่าเดาผิดฝั่ง —
    ของเดิมเหมา 31-39 เป็น "navy" ทำให้เรือใบและเรือสำราญ (36, 37)
    ถูกวาดเป็นเรือรบ
    """
    try:
        t = int(t)
    except (TypeError, ValueError):
        return "unknown"

    # ตาราง ITU-R M.1371 — ครอบให้ครบ ไม่ปล่อยรหัสที่รู้ความหมายแล้วตกเป็น unknown
    # ของเดิมคืน unknown ให้ 20-29, 31-34, 36-37, 40-59, 90-99 ทั้งที่รับรหัสมาแล้ว
    # ทำให้เรือ 3 ใน 4 ลำขึ้นว่าไม่ทราบประเภททั้งที่ข้อมูลอยู่ในมือ
    if t == 30:
        return "fishing"                        # 30 ประมง
    if t in (31, 32, 52):
        return "tug"                            # ลากจูง · เรือลาก
    if t in (35, 51, 55):
        return "navy"                           # ทหาร · ค้นหาช่วยเหลือ · บังคับใช้กฎหมาย
    if 40 <= t <= 49 or 60 <= t <= 69:
        # 40-49 เรือความเร็วสูง (ส่วนใหญ่คือเรือเฟอร์รี) · 60-69 เรือโดยสาร
        # แยกจากเรือสินค้าเพราะมีคนอยู่บนเรือ — สำคัญกว่าเมื่อเกิดเหตุต้องช่วยเหลือ
        return "passenger"
    if 70 <= t <= 79:
        return "cargo"
    if 80 <= t <= 89:
        return "tanker"
    if (20 <= t <= 29) or t in (33, 34, 36, 37, 50, 53, 54, 56, 57, 58, 59) or (90 <= t <= 99):
        # รู้ว่าเป็นอะไร แต่ไม่เข้าหมวดที่แผนที่แยกสี — ยังดีกว่าบอกว่าไม่ทราบ
        return "other"
    return "unknown"                            # 0 หรือรหัสนอกตาราง = ไม่ได้ระบุจริง ๆ


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
        # เก็บรหัสดิบไว้ด้วย — ใช้ตรวจว่าที่ขึ้น "ไม่ทราบประเภท" คือไม่ได้รับข้อมูล
        # หรือรับมาแล้วแต่เราแปลงไม่ได้ สองกรณีนี้แก้ไม่เหมือนกัน
        patch = {"type": ship_type_to_kind(sd.get("Type")), "typeRaw": sd.get("Type")}
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
        # อายุของตำแหน่ง — หน้าเว็บใช้จางหมุดตามความเก่า
        # เรือ 20 นอต เดินทางได้ ~18 กม. ใน 29 นาที ตำแหน่งเก่าจึงต้องดูออกว่าเก่า
        v["ageSec"] = int(now - v.pop("updated", now))
        v.setdefault("type", "unknown")   # ยังไม่ได้ ShipStaticData ≠ ปิดสัญญาณ
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

    # "APIKey" — A และ K ใหญ่ ตามเอกสาร aisstream.io/documentation
    sub = json.dumps({
        "APIKey": api_key,
        "BoundingBoxes": BOUNDING_BOXES,
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    })

    ws = None
    backoff = 3
    while True:
        try:
            ws = websocket.create_connection(
                "wss://stream.aisstream.io/v0/stream", timeout=30)
            ws.send(sub)
            # ยังไม่ประกาศว่า "เชื่อมต่อแล้ว" ตรงนี้ — เปิดซ็อกเก็ตได้ไม่ได้แปลว่า
            # คีย์ผ่าน AISStream รับซ็อกเก็ตก่อนแล้วค่อยปิดเงียบ ๆ ถ้าคีย์ใช้ไม่ได้
            # ถ้าตั้ง connected=True ตรงนี้ หน้าเว็บจะขึ้นเขียวทั้งที่ไม่มีข้อมูลไหลเลย
            _state["error"] = None
            _state["since"] = time.time()
            print("[MDA] AIS: เปิดช่องสัญญาณแล้ว รอข้อมูลชุดแรก…")

            while True:
                raw = ws.recv()
                if not raw:
                    # ปิดแบบสุภาพ ไม่โยน exception — ต้องบันทึกเหตุเอง
                    # มิฉะนั้นหน้าเว็บจะไม่มีทางรู้ว่าสตรีมหยุดไปแล้ว
                    _state["error"] = "สตรีมถูกปิดโดยเซิร์ฟเวอร์"
                    print("[MDA] AIS: เซิร์ฟเวอร์ปิดสตรีม · ต่อใหม่ใน", backoff, "วิ")
                    break
                if not _state["connected"]:
                    _state["connected"] = True
                    backoff = 3          # รีเซ็ตเมื่อ "ได้ข้อมูลจริง" เท่านั้น
                    print("[MDA] AIS: ได้รับข้อมูลแล้ว — คีย์ใช้งานได้")
                try:
                    _handle(json.loads(raw))
                except Exception:
                    pass
        except Exception as e:
            msg = str(e)
            _state["connected"] = False
            _state["error"] = msg[:200]
            # 429 = ต่อถี่เกินไป (AISStream ให้ 1 การเชื่อมต่อต่อคีย์)
            # ถ้าถอยแค่ระดับเดิมจะยิงซ้ำจนหน้าต่างลงโทษไม่มีวันหมด
            if "429" in msg:
                backoff = max(backoff, 120)
                print("[MDA] AIS: ถูกจำกัดอัตรา (429) — ต่อถี่เกินไป "
                      "หรือมีอีกโปรเซสถือคีย์เดียวกันอยู่ · รอ", backoff, "วิ")
            else:
                print("[MDA] AIS: หลุดการเชื่อมต่อ —", msg[:120], "· ต่อใหม่ใน", backoff, "วิ")
        finally:
            # ทุกทางออกจาก try แปลว่าไม่มีข้อมูลไหลแล้ว — ต้องล้างสถานะที่นี่
            # ไม่ใช่ใน except อย่างเดียว เพราะการปิดแบบสุภาพ (recv คืนค่าว่าง)
            # ไม่ผ่าน except เลย ถ้าปล่อยไว้ connected จะค้างเป็น True ตลอดช่วงที่
            # สตรีมตายอยู่ และ backoff จะไม่ถูกรีเซ็ตอีกเลยเพราะ False→True ไม่เกิด
            _state["connected"] = False
            try:
                if ws is not None:
                    ws.close()
            except Exception:
                pass
        time.sleep(backoff)
        backoff = min(backoff * 2, 300)


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
