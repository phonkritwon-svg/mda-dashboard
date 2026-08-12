"""
Vercel serverless:  GET /api/rss?url=<feed>

อ่าน RSS/Atom แล้วคืน JSON รูปแบบเดียวกับ api.rss2json.com เพื่อให้ฝั่งหน้าเว็บ
เปลี่ยนปลายทางอย่างเดียวก็ใช้ได้

ทำไมต้องมีตัวนี้:
  เดิมหน้าเว็บเรียก api.rss2json.com ตรง ๆ ซึ่งเป็นบริการฟรีของบุคคลที่สาม
  และจำกัดอัตราการเพิ่ม "ฟีดใหม่" — พอเพิ่มแหล่งข่าวไทยเข้าไปสามฟีด
  ทุกฟีดใหม่ตอบ 429 ทันที ฟีดข่าวทั้งระบบจึงขึ้นกับโควตาของคนอื่น

ความปลอดภัย:
  รับเฉพาะโฮสต์ใน ALLOWED_HOSTS — ถ้าเปิดให้ยิง URL อะไรก็ได้ นี่จะกลายเป็น
  open proxy ให้คนอื่นใช้ยิงเครือข่ายภายใน (SSRF) ผ่านโดเมนของเรา
"""

from http.server import BaseHTTPRequestHandler
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

TIMEOUT = 20
UA = "Mozilla/5.0 (compatible; MDA-Dashboard/1.0; +maritime OSINT dashboard)"

# โฮสต์ที่อนุญาต — ต้องตรงกับแหล่งข่าวใน news-feed.jsx และ api/cron-news.py
ALLOWED_HOSTS = {
    "gcaptain.com", "www.gcaptain.com",
    "safety4sea.com", "www.safety4sea.com",
    "splash247.com", "www.splash247.com",
    "navaltoday.com", "www.navaltoday.com",
    "maritime-executive.com", "www.maritime-executive.com",
    "news.google.com",
    "www.khaosod.co.th", "khaosod.co.th",
    "www.matichon.co.th", "matichon.co.th",
    "www.thairath.co.th", "thairath.co.th",
    "www.prachachat.net", "prachachat.net",
    "thestandard.co", "www.thestandard.co",
    "globalfishingwatch.org", "www.globalfishingwatch.org",
    "thediplomat.com", "www.thediplomat.com",
    "amti.csis.org", "news.usni.org", "www.navalnews.com",
}

TAG = re.compile(r"<[^>]+>")
IMG_IN_HTML = re.compile(r"<img[^>]+src=[\"']([^\"']+)", re.I)


def _text(el):
    return (el.text or "").strip() if el is not None else ""


def _strip(html, limit=400):
    s = TAG.sub(" ", html or "")
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
          .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " "))
    return re.sub(r"\s+", " ", s).strip()[:limit]


def _find_image(item_el, raw_html):
    """รูปมาได้สามทาง แล้วแต่สำนักข่าว — enclosure, media:*, หรือ <img> ในเนื้อ"""
    for tag in ("enclosure",):
        el = item_el.find(tag)
        if el is not None:
            u = el.get("url") or ""
            if u.startswith("http") and "image" in (el.get("type") or "image"):
                return u
    for tag in ("{http://search.yahoo.com/mrss/}content",
                "{http://search.yahoo.com/mrss/}thumbnail"):
        el = item_el.find(tag)
        if el is not None and (el.get("url") or "").startswith("http"):
            return el.get("url")
    m = IMG_IN_HTML.search(raw_html or "")
    return m.group(1) if m and m.group(1).startswith("http") else ""


def parse_feed(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []

    # RSS 2.0
    for it in root.iter("item"):
        desc_raw = _text(it.find("description"))
        content_raw = _text(it.find("{http://purl.org/rss/1.0/modules/content/}encoded"))
        items.append({
            "title":       _strip(_text(it.find("title")), 300),
            "link":        _text(it.find("link")),
            "pubDate":     _text(it.find("pubDate")),
            "description": _strip(desc_raw),
            "thumbnail":   _find_image(it, content_raw or desc_raw),
            "enclosure":   {},
        })

    # Atom (เผื่อบางแหล่ง)
    if not items:
        ns = "{http://www.w3.org/2005/Atom}"
        for it in root.iter(ns + "entry"):
            link_el = it.find(ns + "link")
            items.append({
                "title":       _strip(_text(it.find(ns + "title")), 300),
                "link":        (link_el.get("href") if link_el is not None else ""),
                "pubDate":     _text(it.find(ns + "updated")) or _text(it.find(ns + "published")),
                "description": _strip(_text(it.find(ns + "summary"))),
                "thumbnail":   "",
                "enclosure":   {},
            })
    return items


def handle(url):
    if not url:
        return {"status": "error", "message": "missing url", "items": []}
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if host not in ALLOWED_HOSTS:
        # ปฏิเสธเงียบ ๆ ไม่บอกว่าอนุญาตโฮสต์ไหนบ้าง
        return {"status": "error", "message": "host not allowed", "items": []}

    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = r.read(3_000_000)
    return {"status": "ok", "items": parse_feed(raw)}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        try:
            body = handle((q.get("url") or [""])[0])
        except Exception as e:
            body = {"status": "error", "message": str(e)[:200], "items": []}
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        # ฟีดข่าวไม่ได้เปลี่ยนทุกวินาที — ให้ CDN ช่วยลดจำนวนครั้งที่ยิงไปหาสำนักข่าว
        self.send_header("Cache-Control", "public, max-age=300, s-maxage=300")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
