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
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml.etree import ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import json
import os
import re
import hashlib
import urllib.request
import urllib.parse

ITEMS_PER_FEED    = 4    # ดึงกี่ข่าวต่อแหล่ง
FEED_TIMEOUT      = 6    # วินาที ต่อการดึง 1 feed
TRANSLATE_TIMEOUT = 4    # วินาที ต่อการแปล 1 ครั้ง
TRANSLATE_BUDGET  = 8    # งบเวลารวมสำหรับการแปลทั้งหมด (กันเกิน maxDuration)
FETCH_WORKERS     = 12   # ดึงทุก feed พร้อมกันในรอบเดียว

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CRON_SECRET  = os.environ.get("CRON_SECRET", "")

SOURCES = [
    # --- ข่าวพาณิชยนาวี / ความมั่นคงทางทะเล ---
    {"key": "GCAP",  "name": "gCaptain",               "url": "https://gcaptain.com/feed/"},
    {"key": "SPL",   "name": "Splash247",              "url": "https://splash247.com/feed/"},
    {"key": "MAREX", "name": "The Maritime Executive", "url": "https://www.maritime-executive.com/articles.rss"},
    {"key": "MLINK", "name": "MarineLink",             "url": "https://www.marinelink.com/news/rss"},
    # --- ทหาร / ความขัดแย้งทางทะเล / เกรย์โซน ---
    {"key": "NVT",   "name": "Naval Today",            "url": "https://navaltoday.com/feed/"},
    {"key": "USNI",  "name": "USNI News",              "url": "https://news.usni.org/feed"},
    {"key": "NAVN",  "name": "Naval News",             "url": "https://www.navalnews.com/feed/"},
    {"key": "AMTI",  "name": "CSIS AMTI",              "url": "https://amti.csis.org/feed/"},
    # --- ภูมิภาคเอเชีย-แปซิฟิก / ชายแดนทางทะเลอาเซียน (The Diplomat) ---
    # ใช้ key เดียวกัน → ข่าวเดียวกันจาก 2 ฟีดถูกรวม (dedupe ด้วย hash ของลิงก์)
    {"key": "DIP",   "name": "The Diplomat",           "url": "https://thediplomat.com/topics/security/feed/"},
    {"key": "DIP",   "name": "The Diplomat",           "url": "https://thediplomat.com/regions/southeast-asia/feed/"},
    # --- ประมงผิดกฎหมาย (IUU) ---
    {"key": "GFW",   "name": "Global Fishing Watch",   "url": "https://globalfishingwatch.org/feed/"},
]


UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
ATOM = "{http://www.w3.org/2005/Atom}"


def http_get(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
           .replace("&nbsp;", " ").replace("&#8217;", "'")
           .replace("&#8220;", '"').replace("&#8221;", '"').replace("&#8211;", "-"))
    return re.sub(r"\s+", " ", s).strip()[:280]


def parse_pubdate(s):
    s = (s or "").strip()
    if not s:
        return datetime.now(timezone.utc).isoformat()
    try:                                  # RFC822 (RSS pubDate)
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    try:                                  # ISO8601 (Atom published/updated)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _atom_link(entry):
    """Atom: เลือก <link rel=alternate href=...> มิฉะนั้นเอา href แรก"""
    href = ""
    for ln in entry.findall(ATOM + "link"):
        if ln.get("rel", "alternate") == "alternate" and ln.get("href"):
            return ln.get("href").strip()
        if not href and ln.get("href"):
            href = ln.get("href").strip()
    return href


def fetch_feed(src):
    out = []
    try:
        root = ET.fromstring(http_get(src["url"], timeout=FEED_TIMEOUT))
        items = root.findall(".//item")
        if items:                         # ---- RSS 2.0 ----
            for it in items[:ITEMS_PER_FEED]:
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
        else:                             # ---- Atom (เช่น Maritime Executive) ----
            for en in root.findall(".//" + ATOM + "entry")[:ITEMS_PER_FEED]:
                t = en.find(ATOM + "title")
                title = (t.text or "").strip() if t is not None and t.text else ""
                if not title:
                    continue
                d = en.find(ATOM + "summary")
                if d is None or not (d.text or "").strip():
                    d = en.find(ATOM + "content")
                desc = (d.text or "") if d is not None else ""
                pub = en.find(ATOM + "published")
                if pub is None:
                    pub = en.find(ATOM + "updated")
                out.append({
                    "key":       src["key"],
                    "outlet":    src["name"],
                    "title":     title,
                    "link":      _atom_link(en),
                    "desc":      strip_html(desc),
                    "published": parse_pubdate(pub.text if pub is not None else ""),
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
        data = json.loads(http_get(url, timeout=TRANSLATE_TIMEOUT))
        return "".join(p[0] for p in data[0] if p and p[0])
    except Exception:
        return text


def translate_all(arts):
    """แปลทุกข่าวขนานกัน ภายใต้งบเวลา TRANSLATE_BUDGET วินาที
    อันไหนแปลไม่ทัน → ปล่อยเป็นอังกฤษ (ไม่ทำให้ฟังก์ชัน timeout)"""
    ex = ThreadPoolExecutor(max_workers=40)
    tasks = {}
    for i, a in enumerate(arts):
        tasks[ex.submit(gtranslate, a["title"])] = (i, "title_th")
        if a.get("desc"):
            tasks[ex.submit(gtranslate, a["desc"])] = (i, "summary_th")
    try:
        for fut in as_completed(list(tasks), timeout=TRANSLATE_BUDGET):
            i, field = tasks[fut]
            try:
                arts[i][field] = fut.result()
            except Exception:
                pass
    except Exception:
        pass  # หมดงบเวลา — ใช้เท่าที่แปลเสร็จ
    try:
        ex.shutdown(wait=False, cancel_futures=True)
    except TypeError:
        ex.shutdown(wait=False)
    return arts


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


def upsert_table(table, rows):
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        SUPABASE_URL.rstrip("/") + "/rest/v1/" + table,
        data=body, method="POST",
        headers={
            "apikey":        SERVICE_KEY,
            "Authorization": "Bearer " + SERVICE_KEY,
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates,return=minimal",
        })
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.status


def upsert(rows):
    return upsert_table("news", rows)


# ── สร้าง "เหตุการณ์" จากข่าวภัยสูง ─────────────────────────────
# เลือกเฉพาะข่าวที่ (1) รุนแรงพอ และ (2) ระบุพื้นที่ทางทะเลได้ → ขึ้นหมุดบนแผนที่
REGIONS = [
    (re.compile(r"red sea|bab[- ]?el[- ]?mandeb|hodeida|yemen", re.I),     ("Red Sea / Bab el-Mandeb", "ทะเลแดง / บับเอลมันเดบ", 13.5, 43.3)),
    (re.compile(r"strait of hormuz|hormuz|fujairah|persian gulf", re.I),   ("Strait of Hormuz",        "ช่องแคบฮอร์มุซ",        26.5, 56.3)),
    (re.compile(r"gulf of aden|\baden\b", re.I),                           ("Gulf of Aden",            "อ่าวเอเดน",             12.5, 47.0)),
    (re.compile(r"south china sea|scarborough|spratly|paracel|second thomas|taiwan strait", re.I), ("South China Sea", "ทะเลจีนใต้",  15.0, 117.0)),
    (re.compile(r"strait of malacca|malacca|singapore strait", re.I),      ("Strait of Malacca",       "ช่องแคบมะละกา",         2.5,  101.0)),
    (re.compile(r"gulf of thailand", re.I),                                ("Gulf of Thailand",        "อ่าวไทย",               9.5,  101.5)),
    (re.compile(r"andaman", re.I),                                         ("Andaman Sea",             "ทะเลอันดามัน",          8.0,  97.0)),
    (re.compile(r"natuna", re.I),                                          ("North Natuna Sea",        "ทะเลนาตูนาเหนือ",       5.0,  109.2)),
    (re.compile(r"black sea|novorossiysk|odes[as]|crimea", re.I),          ("Black Sea",               "ทะเลดำ",                44.0, 36.0)),
    (re.compile(r"baltic|gulf of finland|kattegat|gotland", re.I),         ("Baltic Sea",              "ทะเลบอลติก",            59.0, 21.0)),
    (re.compile(r"gulf of guinea|nigeria|lagos", re.I),                    ("Gulf of Guinea",          "อ่าวกินี",              3.0,  5.0)),
    (re.compile(r"somali|horn of africa|gulf of oman|arabian sea", re.I),  ("Arabian Sea / Horn",      "ทะเลอาหรับ / จะงอยแอฟริกา", 12.0, 55.0)),
    (re.compile(r"mediterranean|aegean|libya|gaza", re.I),                 ("Mediterranean Sea",       "ทะเลเมดิเตอร์เรเนียน",   34.0, 18.0)),
    (re.compile(r"caribbean|venezuela|panama canal", re.I),                ("Caribbean Sea",           "ทะเลแคริบเบียน",        14.0, -72.0)),
    (re.compile(r"indian ocean", re.I),                                    ("Indian Ocean",            "มหาสมุทรอินเดีย",       5.0,  75.0)),
]

SEV_CRIT = re.compile(r"\b(attack|attacked|missile|drone strike|explosion|struck|killed|sunk|sinking|hijack|seized|under fire|ballistic)\b", re.I)
SEV_HIGH = re.compile(r"\b(seiz|detain|collision|capsiz|distress|piracy|pirate|smuggl|illegal fishing|incursion|intercept|boarded|sabotage|cable)\b", re.I)

THREAT_CATS = [
    ("SEARCH & RESCUE",     re.compile(r"rescue|distress|capsiz|sinking|missing|overboard|search and rescue", re.I)),
    ("PIRACY",              re.compile(r"piracy|pirate|armed robbery|hijack|kidnap", re.I)),
    ("IUU FISHING",         re.compile(r"illegal fishing|\biuu\b|trawler|poach", re.I)),
    ("MARITIME TERRORISM",  re.compile(r"houthi|missile|drone|attack|explosion|struck|militant|terror", re.I)),
    ("DRUG & ARMS",         re.compile(r"drug|narcotic|smuggl|contraband|weapons? seiz", re.I)),
    ("SUBSEA / INFRA",      re.compile(r"cable|pipeline|sabotage|infrastructure", re.I)),
]


def _ev_text(a):
    return " ".join([a.get("title", ""), a.get("desc", ""),
                     a.get("title_th", "") or "", a.get("summary_th", "") or ""])


def to_event_row(a):
    text = _ev_text(a)
    # ต้องระบุพื้นที่ทางทะเลได้ (เพื่อขึ้นหมุดบนแผนที่)
    geo = None
    for rx, info in REGIONS:
        if rx.search(text):
            geo = info
            break
    if not geo:
        return None
    # ต้องมีสัญญาณภัย: ความรุนแรง หรือ เข้าหมวดภัยคุกคามชัดเจน
    sev = "critical" if SEV_CRIT.search(text) else ("high" if SEV_HIGH.search(text) else None)
    cat = None
    for name, rx in THREAT_CATS:
        if rx.search(text):
            cat = name
            break
    if not sev and not cat:
        return None
    sev = sev or "medium"
    cat = cat or "MARITIME"
    region_en, region_th, lat, lon = geo
    eid = "evt_" + a["key"] + "_" + hashlib.sha1((a["link"] or a["title"]).encode("utf-8")).hexdigest()[:16]
    return {
        "id":            eid,
        "sev":           sev,
        "cat":           cat,
        "src_key":       a["key"],
        "title_en":      a["title"],
        "title_th":      a.get("title_th") or None,
        "area_en":       region_en, "area_th": region_th,
        "region_en":     region_en, "region_th": region_th,
        "summary_en":    a["desc"], "summary_th": a.get("summary_th") or None,
        "lat":           lat, "lon": lon,
        "conf":          3,
        "tags":          [],
        "source_outlet": a["outlet"],
        "source_url":    a["link"] or None,
        "resolved":      False,
        "origin":        "cron",
        "published_at":  a["published"],
    }


def run():
    arts = []
    with ThreadPoolExecutor(max_workers=FETCH_WORKERS) as ex:
        for r in ex.map(fetch_feed, SOURCES):
            arts.extend(r)
    if not arts:
        return {"ok": False, "reason": "no_articles"}, 502
    arts = translate_all(arts)
    translated = sum(1 for a in arts if a.get("title_th"))
    rows = [to_row(a) for a in arts]
    status = upsert(rows)

    # สร้างเหตุการณ์จากข่าวภัยสูงที่ระบุพื้นที่ได้
    event_rows = [r for r in (to_event_row(a) for a in arts) if r]
    events_status = None
    if event_rows:
        try:
            events_status = upsert_table("events", event_rows)
        except Exception as e:
            events_status = "err:" + str(e)

    return {"ok": True, "count": len(rows), "translated": translated,
            "upsert_status": status, "events": len(event_rows),
            "events_status": events_status}, 200


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        # debug fast-path: ยืนยันว่าฟังก์ชันรัน + env พร้อม (ไม่ทำงานหนัก)
        if "debug" in self.path:
            return self._json({
                "ok": True,
                "has_url": bool(SUPABASE_URL),
                "has_key": bool(SERVICE_KEY),
                "key_prefix": (SERVICE_KEY[:10] + "...") if SERVICE_KEY else None,
            })
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
