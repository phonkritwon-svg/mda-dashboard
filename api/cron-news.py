"""
Vercel Cron:  GET /api/cron-news  (รันอัตโนมัติทุกวันตาม vercel.json)
ดึง RSS จาก 5 แหล่ง maritime → แปลไทย (Google Translate) →
เขียนลงตาราง Supabase 'news' ด้วย service_role key (bypass RLS)

ENV ที่ต้องตั้งใน Vercel:
  SUPABASE_URL                 = https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    = (service_role secret — อย่าใส่ในโค้ด)
  CRON_SECRET                  = (ไม่บังคับ) ถ้าตั้งไว้ จะตรวจ header ก่อนรัน
"""

from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
from xml.etree import ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import json
import os
import re
import hashlib
import urllib.request
import urllib.parse

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CRON_SECRET  = os.environ.get("CRON_SECRET", "")

SOURCES = [
    {"key": "GCAP",  "name": "gCaptain",            "url": "https://gcaptain.com/feed/"},
    {"key": "S4S",   "name": "Safety4Sea",          "url": "https://safety4sea.com/feed/"},
    {"key": "SPL",   "name": "Splash247",           "url": "https://splash247.com/feed/"},
    {"key": "NVT",   "name": "Naval Today",         "url": "https://navaltoday.com/feed/"},
    {"key": "MAREX", "name": "The Maritime Executive", "url": "https://maritime-executive.com/rss/articles"},
]


def http_get(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (MDA-cron)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
           .replace("&nbsp;", " ").replace("&#8217;", "'")
           .replace("&#8220;", '"').replace("&#8221;", '"').replace("&#8211;", "-"))
    return re.sub(r"\s+", " ", s).strip()[:280]


def parse_pubdate(s):
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def fetch_feed(src):
    out = []
    try:
        root = ET.fromstring(http_get(src["url"]))
        for it in root.findall(".//item")[:12]:
            title = (it.findtext("title") or "").strip()
            if not title:
                continue
            out.append({
                "key":       src["key"],
                "outlet":    src["name"],
                "title":     title,
                "link":      (it.findtext("link") or "").strip(),
                "desc":      strip_html(it.findtext("description") or ""),
                "published": parse_pubdate(it.findtext("pubDate") or ""),
            })
    except Exception:
        pass
    return out


def gtranslate(text, target="th"):
    if not text or not text.strip():
        return ""
    url = ("https://translate.googleapis.com/translate_a/single"
           "?client=gtx&sl=auto&tl=" + target + "&dt=t&q=" + urllib.parse.quote(text[:500]))
    try:
        data = json.loads(http_get(url, timeout=8))
        return "".join(p[0] for p in data[0] if p and p[0])
    except Exception:
        return text


def translate_item(a):
    a["title_th"]   = gtranslate(a["title"])
    a["summary_th"] = gtranslate(a["desc"]) if a["desc"] else ""
    return a


def to_row(a):
    rid = "live_" + a["key"] + "_" + hashlib.sha1((a["link"] or a["title"]).encode("utf-8")).hexdigest()[:16]
    return {
        "id":           rid,
        "src_key":      a["key"],
        "outlet":       a["outlet"],
        "category":     "MARITIME",
        "title_en":     a["title"],
        "title_th":     a.get("title_th") or None,
        "summary_en":   a["desc"],
        "summary_th":   a.get("summary_th") or None,
        "url":          a["link"] or "#",
        "reliability":  "B",
        "credibility":  "2",
        "verdict":      "unverified",
        "is_live":      True,
        "published_at": a["published"],
        "fetched_at":   datetime.now(timezone.utc).isoformat(),
    }


def upsert(rows):
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        SUPABASE_URL.rstrip("/") + "/rest/v1/news",
        data=body, method="POST",
        headers={
            "apikey":        SERVICE_KEY,
            "Authorization": "Bearer " + SERVICE_KEY,
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates,return=minimal",
        })
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.status


def run():
    arts = []
    with ThreadPoolExecutor(max_workers=5) as ex:
        for r in ex.map(fetch_feed, SOURCES):
            arts.extend(r)
    if not arts:
        return {"ok": False, "reason": "no_articles"}, 502
    with ThreadPoolExecutor(max_workers=10) as ex:
        arts = list(ex.map(translate_item, arts))
    rows = [to_row(a) for a in arts]
    status = upsert(rows)
    return {"ok": True, "count": len(rows), "upsert_status": status}, 200


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if CRON_SECRET:
            if self.headers.get("Authorization", "") != "Bearer " + CRON_SECRET:
                return self._json({"error": "unauthorized"}, 401)
        if not SUPABASE_URL or not SERVICE_KEY:
            return self._json({"error": "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env"}, 500)
        try:
            res, code = run()
            self._json(res, code)
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
