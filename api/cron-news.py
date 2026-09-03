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
import urllib.error

ITEMS_PER_FEED    = 4    # ดึงกี่ข่าวต่อแหล่ง
FEED_TIMEOUT      = 6    # วินาที ต่อการดึง 1 feed
TRANSLATE_TIMEOUT = 4    # วินาที ต่อการแปล 1 ครั้ง
TRANSLATE_BUDGET  = 8    # งบเวลารวมสำหรับการแปลทั้งหมด (กันเกิน maxDuration)
FETCH_WORKERS     = 12   # ดึงทุก feed พร้อมกันในรอบเดียว

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CRON_SECRET  = os.environ.get("CRON_SECRET", "")


def _gnews(q, hl="en-US", gl="US", ceid="US:en"):
    """สร้าง Google News RSS แบบ query — ค้นทั่วโลกแต่เจาะหัวข้อ/ภูมิภาคที่เลือก"""
    return ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q) +
            "&hl=" + hl + "&gl=" + gl + "&ceid=" + ceid)


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
    # --- ภูมิภาคไทย/อาเซียน (Google News query — ค้นทั่วโลก โฟกัสภูมิภาค) ---
    # key เดียวกัน → ข่าวซ้ำจากหลาย query ถูกรวม (dedupe ด้วย hash ของลิงก์)
    {"key": "GNEWS", "name": "ภูมิภาค (Google News)",
     "url": _gnews('("Gulf of Thailand" OR "South China Sea" OR "Andaman Sea" OR Malacca OR '
                   '("Thailand" "Cambodia")) (maritime OR "fishing vessel" OR navy OR '
                   '"illegal fishing" OR smuggling OR incursion) when:30d')},
    {"key": "GNEWS", "name": "ภูมิภาค (Google News)", "th_only": True,
     "url": _gnews("(น่านน้ำ OR ทะเล OR ประมง OR อ่าวไทย) "
                   "(กัมพูชา OR รุกล้ำ OR ผิดกฎหมาย OR เกาะกูด OR ลักลอบ) when:60d",
                   hl="th", gl="TH", ceid="TH:th")},

    # --- ข่าวในประเทศไทย (Google News ภาษาไทย) ---
    # ตั้งใจผูกกับภัยคุกคาม 9 ด้านของ ศรชล. ไม่ใช่ดึงข่าวในประเทศมาทั้งหมด
    # ถ้ารับทุกอย่างแดชบอร์ดจะกลายเป็นเครื่องอ่านข่าวทั่วไป ไม่ใช่ภาพสถานการณ์ทางทะเล
    # แต่ละ query จับหนึ่งกลุ่มด้าน เพื่อให้ classifyThreats จัดหมวดได้แม่นขึ้น
    {"key": "THNEWS", "name": "ในประเทศ (Google News)", "th_only": True,
     "url": _gnews("(ประมงผิดกฎหมาย OR เรือประมง OR IUU OR ลอบจับสัตว์น้ำ OR "
                   "\"แรงงานประมง\") (ไทย OR จับกุม OR ตรวจยึด) when:14d",
                   hl="th", gl="TH", ceid="TH:th")},
    {"key": "THNEWS", "name": "ในประเทศ (Google News)", "th_only": True,
     "url": _gnews("(ลักลอบขนส่ง OR ค้ามนุษย์ OR ยาเสพติด OR ตรวจยึด) "
                   "(ชายแดน OR ท่าเรือ OR ทางทะเล OR แม่น้ำ) when:14d",
                   hl="th", gl="TH", ceid="TH:th")},
    {"key": "THNEWS", "name": "ในประเทศ (Google News)", "th_only": True,
     "url": _gnews("(เรือล่ม OR เรือจม OR ค้นหาผู้สูญหาย OR กู้ภัยทางทะเล OR "
                   "\"คลื่นลมแรง\" OR \"น้ำมันรั่ว\" OR ปลาตาย) when:14d",
                   hl="th", gl="TH", ceid="TH:th")},
    {"key": "THNEWS", "name": "ในประเทศ (Google News)", "th_only": True,
     "url": _gnews("(ศรชล OR \"กองทัพเรือ\" OR \"ตำรวจน้ำ\" OR \"กรมเจ้าท่า\" OR "
                   "\"กรมประมง\") (ปฏิบัติการ OR ตรวจการณ์ OR จับกุม OR แถลง) when:14d",
                   hl="th", gl="TH", ceid="TH:th")},
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


# ── ตัวกรอง "ข่าวไทยทางน้ำ" (ใช้กับฟีดภาษาไทยเท่านั้น) ─────────────────
# ต้องตรงกับ isThaiWaterNews ใน news-feed.jsx — แก้ที่ไหนต้องแก้ทั้งสองที่
#
# ทำไมต้องมี: คิวรี Google News ภาษาไทยดูดของสองแบบเข้ามามากกว่าข่าวที่ต้องการ
#   ก) ข่าวต่างประเทศแปลไทย — Vietnam.vn แปลข่าวเวียดนามทั้งเว็บ ("เรือล่มใน
#      แม่น้ำดงไน") ปนกับข่าวไซปรัส เกาหลีใต้ ลิเบีย บัลแกเรีย
#   ข) ข่าวไทยที่ไม่เกี่ยวกับน้ำ — คิวรี "ลักลอบ/ยาเสพติด/ชายแดน" คืนข่าวจับ
#      ยาบ้าชายแดนภาคเหนือแทบทั้งฟีด ซึ่งเป็นเรื่องทางบกล้วน ๆ
# ทั้งสองแบบเคยถูกเขียนลงตาราง news ทุกวันและกลายเป็นหมุดบนแผนที่ด้วย

# จุดยึด "ทางน้ำ" — นับแม่น้ำ/คลอง/เขื่อนด้วย ไม่ใช่แค่ทะเล
TH_WATER = re.compile("|".join([
    # "ทะเลทราย" ไม่ใช่ทะเล และ "ทะเลาะ" ก็ขึ้นต้นด้วย "ทะเล" — วัดจริงแล้ว
    # ข่าวฆาตกรรมในครอบครัวที่มีคำว่า "ทะเลาะกันรุนแรง" ผ่านตัวกรองเข้ามาได้
    "ทะเล(?!ทราย|าะ)|น่านน้ำ|ชายฝั่ง|อ่าว|ปากน้ำ|ปากอ่าว|ทางน้ำ|เกาะกูด|เกาะกง",
    # แหล่งน้ำในแผ่นดิน — เอาแค่ "แม่น้ำ" ตั้งใจไม่ใส่ คลอง/เขื่อน/ลำน้ำ/อ่างเก็บน้ำ
    # เพราะวัดแล้วพาเข้ามาแต่ข่าวน้ำท่วม ภัยแล้ง และชื่อสถานที่ (คลองสามวา)
    "แม่น้ำ",
    # ห้ามใช้ "เรือ" ลอย ๆ เพราะไปตรงกับ "เรือนจำ" "เรือนแพ" "เรือธง"
    "เรือประมง|เรือล่ม|เรือจม|เรืออับปาง|เรือบรรทุก|เรือสินค้า|เรือโดยสาร|เรือเฟอร์รี",
    "เรือตรวจการณ์|เรือรบ|เรือหลวง|เรือยาง|เรือเร็ว|สปีดโบ๊ท|ลูกเรือ|ท่าเรือ|ท่าเทียบเรือ|อู่เรือ",
    "ประมง|อวนลาก|อวนครอบ|อวนรุน|จับสัตว์น้ำ|สัตว์น้ำ|แพปลา|IUU",
    # "ตำรวจน้ำ" ไปตรงกับส่วนหน้าของ "ตำรวจน้ำพอง" (สภ.น้ำพอง ขอนแก่น) —
    # ภาษาไทยไม่มีช่องว่างคั่นคำ จึงต้องกันชื่ออำเภอที่ขึ้นต้นด้วย "น้ำ" เอง
    "ศรชล|กองทัพเรือ|ทัพเรือภาค|ทหารเรือ|นาวิกโยธิน|กรมเจ้าท่า|เจ้าท่า|หน่วยซีล",
    "ตำรวจน้ำ(?!พอง|โสม|ปาด|ยืน|เกลี้ยง|หนาว|ขุ่น|ริน)",
    "จมน้ำ|ตกน้ำ|ลอยคอ|ดำน้ำ|ประดาน้ำ|กู้ภัยทางทะเล|กู้ภัยทางน้ำ|จมทะเล",
    "น้ำมันรั่ว|มลพิษทางทะเล|เต่าทะเล|พะยูน|ปะการัง|วาฬ|โลมา|ปลาตาย|แพลงก์ตอน",
    "คลื่นลมแรง|คลื่นแรง|คลื่นสูง|เรือเล็กควรงด|เรือเล็กงด|มรสุม",
    "โรฮีนจา|รุกล้ำน่านน้ำ|แรงงานประมง",
]), re.I)   # re.I เพื่อ "IUU" / "iuu"

# ชื่อจังหวัด — ชุดเดียวกับ TH_PROVINCE_RE ใน components.jsx
# ชื่อสั้นที่เป็นคำทั่วไปหรือเป็นส่วนหน้าของคำอื่นต้องบังคับให้มีคำนำหน้า
# "จังหวัด/จ." เสมอ: เลย → "ไม่ได้เลย" · น่าน → "น่านน้ำ" · แพร่ → "แพร่ระบาด"
TH_PROVINCE = "|".join([
    "นราธิวาส|ปัตตานี|ยะลา|สงขลา|สตูล|พัทลุง|ตรัง|กระบี่|ภูเก็ต|พังงา|ระนอง",
    "ชุมพร|สุราษฎร์ธานี|นครศรีธรรมราช|ประจวบคีรีขันธ์|เพชรบุรี",
    "สมุทรปราการ|สมุทรสาคร|สมุทรสงคราม|ชลบุรี|ระยอง|จันทบุรี|ตราด|สระแก้ว",
    "กรุงเทพ|นนทบุรี|ปทุมธานี|อยุธยา|สระบุรี|ลพบุรี|นครสวรรค์|พิษณุโลก|พิจิตร|เพชรบูรณ์",
    "ขอนแก่น|นครราชสีมา|โคราช|อุดรธานี|ชัยภูมิ|สุรินทร์|บุรีรัมย์|อุบลราชธานี",
    "หนองคาย|นครพนม|มุกดาหาร|กาฬสินธุ์|ร้อยเอ็ด|สกลนคร",
    "เชียงใหม่|เชียงราย|ลำปาง|ลำพูน|พะเยา|แม่ฮ่องสอน|แม่สอด|สุโขทัย|อุตรดิตถ์",
    "กาญจนบุรี|ราชบุรี|สุพรรณบุรี|นครปฐม",
    "(?:จังหวัด|จ\\.\\s?)(?:เลย|น่าน|แพร่|ตาก)",
])

# จุดยึด "ในประเทศไทย" — ห้ามใช้ "ไทย" ลอย ๆ เพราะไปตรงกับ "ปลาดุกไทย"
# "ตามรอยไทย" และชื่อจังหวัดเวียดนามที่แปลมา
TH_HERE = re.compile("|".join([
    "ประเทศไทย|ราชอาณาจักรไทย|ในไทย|ที่ไทย|ของไทย|เข้าไทย|ถึงไทย|ฝั่งไทย|ทั่วไทย|มาไทย",
    "น่านน้ำไทย|ทะเลไทย|อ่าวไทย|ประมงไทย|ไทย[-–]กัมพูชา|ไทย[-–]มาเลเซีย|ไทย[-–]เมียนมา|ไทย[-–]พม่า|ไทย[-–]ลาว",
    "อันดามัน|ทะเลสาบสงขลา|แหลมฉบัง|สัตหีบ|พัทยา|บางแสน|หัวหิน|ป่าตอง|คลองเตย|มาบตาพุด",
    "เกาะสมุย|เกาะพะงัน|เกาะเต่า|เกาะช้าง|เกาะล้าน|เกาะสีชัง|เกาะพีพี|เกาะเสม็ด|แสมสาร",
    "แม่น้ำเจ้าพระยา|แม่น้ำน่าน|น้ำน่าน|แม่น้ำโขง|แม่น้ำมูล|แม่น้ำชี|แม่น้ำป่าสัก|แม่น้ำท่าจีน",
    "แม่น้ำแม่กลอง|แม่น้ำบางปะกง|แม่น้ำตาปี|แม่น้ำปิง|แม่น้ำวัง|แม่น้ำยม|แม่น้ำสาย|แม่น้ำเมย",
    "ศรชล|ทัพเรือภาค|เรือหลวง|กองทัพเรือไทย|กรมเจ้าท่า|กรมประมง|ประมงจังหวัด",
    "ศูนย์ควบคุมการแจ้งเรือ|กรมทรัพยากรทางทะเล|กรมอุตุนิยมวิทยา|กรมอุตุ|อุตุฯ",
    "ปภ\\.|กรมป้องกันและบรรเทาสาธารณภัย|ครม\\.|คณะรัฐมนตรี|ตชด\\.|กอ\\.รมน\\.",
    "ตำรวจน้ำ(?!พอง|โสม|ปาด|ยืน|เกลี้ยง|หนาว|ขุ่น|ริน)",
    TH_PROVINCE,
]), re.I)

# เว็บแปลอัตโนมัติ/สำนักข่าวต่างชาติ — ตัดขาดโดยไม่ต้องดูเนื้อหา
# Vietnam.vn คือแหล่งขยะอันดับหนึ่งในฟีดภาษาไทย (แปลข่าวเวียดนามทั้งเว็บ)
TH_FOREIGN_PUB = re.compile(
    r"vietnam\.vn|vietnamplus|vietnamnet|nhandan|tuoitre|thanhnien|公視|xinhua|globaltimes|antaranews|bernama",
    re.I)

# Thái Nguyên จังหวัดของเวียดนาม แปลไทยแล้วมีคำว่า "ไทย" อยู่ในตัว
# ถ้าไม่ลบทิ้งก่อน ข่าวเรือล่มในเวียดนามจะผ่านเงื่อนไข "ในไทย" ได้ทุกชิ้น
TH_FOREIGN_TRAP = re.compile("ไทยเหงียน|ไทเหงียน|ไทยเหวียน")

# ชื่อประเทศ/น่านน้ำต่างชาติ — ใช้ตัดเฉพาะเมื่อ "ไม่มี" จุดยึดในไทยเลย
# ตั้งใจไม่ใส่ กัมพูชา/เมียนมา/มาเลเซีย/ลาว/สหรัฐ/จีน เพราะข่าวทางน้ำของไทย
# พูดถึงประเทศเหล่านี้เป็นปกติ (เรือรบสหรัฐเทียบท่าสัตหีบ · รุกล้ำน่านน้ำ
# ไทย-กัมพูชา) การตัดด้วยชื่อประเทศพวกนี้จะฆ่าข่าวจริงมากกว่าที่ได้
TH_FOREIGN_PLACE = re.compile("|".join([
    "เวียดนาม|เหงียน|ดงไน|ดานัง|ฮานอย|โฮจิมินห์|กวางตรี|กว๋าง|ไซ่ง่อน",
    "ไซปรัส|ลิเบีย|บัลแกเรีย|ทะเลดำ|กรีซ|ตุรกี|อิตาลี|สเปน|โปรตุเกส",
    "เกาหลีใต้|เกาหลีเหนือ|ปูซาน|ญี่ปุ่น|ไต้หวัน|ฟิลิปปินส์|อินโดนีเซีย|อินเดีย|ศรีลังกา|บังกลาเทศ",
    "ทะเลจีนใต้|ทะเลแดง|เมดิเตอร์เรเนียน|ฮอร์มุซ|อิหร่าน|เยเมน|ฮูตี|กาซา|อิสราเอล",
    "เม็กซิโก|เปรู|บราซิล|ไนจีเรีย|โซมาเลีย|ยูเครน|รัสเซีย|ไททานิก",
]))


def is_thai_water_news(text, require_thai=True):
    """ข่าวชิ้นนี้เป็น "ข่าวไทยทางน้ำ" หรือไม่ (ใช้กับฟีด th_only เท่านั้น)"""
    hay = text or ""
    if TH_FOREIGN_PUB.search(hay):
        return False
    t = TH_FOREIGN_TRAP.sub(" ", hay)
    if not TH_WATER.search(t):
        return False
    here = bool(TH_HERE.search(t))
    if not here and TH_FOREIGN_PLACE.search(t):
        return False
    if require_thai and not here:
        return False
    return True


def fetch_feed(src):
    out = []
    try:
        root = ET.fromstring(http_get(src["url"], timeout=FEED_TIMEOUT))
        items = root.findall(".//item")
        if items:                         # ---- RSS 2.0 ----
            for it in items:
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
            for en in root.findall(".//" + ATOM + "entry"):
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
    # ฟีดภาษาไทย: เอาเฉพาะข่าวไทยทางน้ำ — ต้องกรอง "ก่อน" ตัดจำนวน
    # มิฉะนั้นโควตา ITEMS_PER_FEED จะถูกข่าวเวียดนาม/ข่าวจับยาบ้าชายแดนกินจนหมด
    # ตั้งแต่หัวฟีด แล้วได้ข่าวไทยจริงกลับมาศูนย์ชิ้น
    if src.get("th_only"):
        out = [a for a in out if is_thai_water_news(a["title"] + " " + a["desc"])]
    return out[:ITEMS_PER_FEED]


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
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status
    except urllib.error.HTTPError as e:
        # PostgREST อธิบายสาเหตุไว้ใน body เสมอ (code/message/details) แต่ urllib
        # ทิ้งมันไปเหลือแค่ "HTTP Error 500" ซึ่งบอกไม่ได้ว่าคอลัมน์ผิด สิทธิ์ไม่พอ
        # หรือ id ซ้ำในชุดเดียวกัน — สามอย่างนี้แก้คนละทางโดยสิ้นเชิง
        try:
            detail = e.read().decode("utf-8", "replace")[:400]
        except Exception:
            detail = "(no body)"
        raise RuntimeError("supabase %s %s: %s" % (table, e.code, detail)) from None


def dedupe_by_id(rows):
    """เก็บแถวแรกของแต่ละ id — คำสั่ง upsert เดียวมี id ซ้ำไม่ได้

    ฟีดหลายชุดใช้ key เดียวกัน (THNEWS 4 คิวรี, DIP 2 ฟีด) และคิวรี Google News
    ทับซ้อนกันมาก ข่าวเดียวกันจึงโผล่ได้หลายรอบในการดึงครั้งเดียว พอ id เป็น
    hash ของลิงก์ สองแถวนั้นจะมี id เท่ากัน

    PostgreSQL ปฏิเสธทั้งคำสั่งด้วย 21000 "ON CONFLICT DO UPDATE command cannot
    affect row a second time" แล้ว PostgREST แปลงเป็น HTTP 500 ผลคือข่าว
    ทั้งชุดไม่เข้าเลย ไม่ใช่แค่แถวที่ซ้ำ — คอมเมนต์ที่ SOURCES เขียนไว้ว่า
    "ถูกรวมด้วย hash ของลิงก์" อธิบายเจตนา แต่การรวมไม่เคยเกิดขึ้นจริง
    """
    seen = {}
    for r in rows:
        seen.setdefault(r["id"], r)
    return list(seen.values())


def upsert(rows):
    return upsert_table("news", rows)


# ── สร้าง "เหตุการณ์" จากข่าวภัยสูง ─────────────────────────────
# เลือกเฉพาะข่าวที่ (1) รุนแรงพอ และ (2) ระบุพื้นที่ทางทะเลได้ → ขึ้นหมุดบนแผนที่
#
# สร้างจาก MDA_GEO_REGIONS ใน events-feed.jsx (ฝั่งหน้าเว็บ) โดยตรง — ต้อง
# ตรงกันเสมอ ไม่งั้นแผนที่กับ "เหตุการณ์" ที่ cron สร้างจะปักหมุดคนละที่
# ให้ข่าวเดียวกัน แก้ที่ไหนต้องแก้ทั้งสองไฟล์ (หรือรันสคริปต์สร้างใหม่)
#
# "ระดับความเฉพาะเจาะจง" (rank) — ยิ่งเจาะจง ยิ่งเชื่อได้ ยิ่งควรชนะ
#   0 = point    — ท่าเรือ/เกาะ/หาด/ปากน้ำ — จุดเกิดเหตุจริง ไม่ใช่แค่จังหวัด
#   1 = specific — จังหวัด/ช่องแคบ/เมืองท่า/ชายฝั่งประเทศเพื่อนบ้าน
#   2 = water    — ทะเลหรืออ่าวที่มีชื่อเฉพาะ — เป็นพื้นที่กว้าง ไม่ใช่จุด
#   3 = country  — ประเทศ/มหาสมุทร — กว้างจนแทบไม่บอกอะไร
#
# ใช้ rank เลือกผู้ชนะ ไม่ใช่ลำดับบรรทัด ข่าวที่พูดถึงทั้ง "Strait of Hormuz"
# และ "Indian Ocean" ต้องลงที่ช่องแคบ ไม่ใช่กลางมหาสมุทร — และข่าว "จมน้ำ
# กลางทะเลปากอ่าวแหลมฉบัง" ต้องลงที่ท่าเรือแหลมฉบัง ไม่ใช่กลางจังหวัดชลบุรี
REGIONS = [
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"red sea|bab[- ]?el[- ]?mandeb|hodeida|yemen|ทะเลแดง|บับเอล", re.I), 2, ("Red Sea / Bab el-Mandeb", "ทะเลแดง / บับเอลมันเดบ", 13.5, 43.3)),
    # ---- เฉพาะเจาะจง (specific) จังหวัด/ช่องแคบ/เมืองท่า ----
    (re.compile(r"strait of hormuz|hormuz|fujairah|ช่องแคบฮอร์มุซ", re.I), 1, ("Strait of Hormuz", "ช่องแคบฮอร์มุซ", 26.5, 56.3)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"persian gulf|arabian gulf|kharg|saudi|kuwait|bahrain|qatar|\buae\b|emirates|dubai|abu dhabi|อ่าวเปอร์เซีย", re.I), 2, ("Persian Gulf", "อ่าวเปอร์เซีย", 26.5, 52.0)),
    (re.compile(r"gulf of aden|\baden\b|อ่าวเอเดน", re.I), 2, ("Gulf of Aden", "อ่าวเอเดน", 12.5, 47.0)),
    (re.compile(r"south china sea|scarborough|spratly|paracel|second thomas|taiwan strait|ทะเลจีนใต้|สการ์โบโรห์|พารา?เซล|สปร(?:าต|ตลี)|ทะเลจีน", re.I), 2, ("South China Sea", "ทะเลจีนใต้", 15.0, 117.0)),
    # ---- เฉพาะเจาะจง (specific) จังหวัด/ช่องแคบ/เมืองท่า ----
    (re.compile(r"strait of malacca|malacca|singapore strait|ช่องแคบมะละกา|มะละกา|สิงค์โปร์|singapor", re.I), 1, ("Strait of Malacca", "ช่องแคบมะละกา", 2.5, 101.0)),
    (re.compile(r"cambodia|cambodian|khmer|sihanoukville|sihanouk|kampong som|ream|kampot|กัมพูชา|เขมร|สีหนุ", re.I), 1, ("Cambodia Coast", "ชายฝั่งกัมพูชา / อ่าวไทย", 10.6, 103.5)),
    (re.compile(r"myanmar|burma|burmese|rakhine|arakan|sittwe|kyauk ?phyu|kyaukpyu|coco island|great coco|mergui|myeik|tanintharyi|yangon|naypyidaw|irrawaddy|rohingya|เมียนมา|พม่า|โรฮีนจา", re.I), 1, ("Myanmar Coast", "ชายฝั่งเมียนมา / อันดามัน–เบงกอล", 15.5, 94.5)),
    (re.compile(r"malaysia|malaysian|melaka|johor|sabah|sarawak|kota kinabalu|labuan|lumut|langkawi|penang|port klang|kuala lumpur|putrajaya|มาเลเซีย", re.I), 1, ("Malaysia Coast", "มาเลเซีย / มะละกา–บอร์เนียว", 4.0, 109.5)),
    (re.compile(r"\btrat\b|ตราด", re.I), 1, ("Trat", "ตราด", 12.0, 102.5)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"overlapping claims|\boca\b|พื้นที่อ้างสิทธิทับซ้อน|พื้นที่ทับซ้อน", re.I), 2, ("Gulf of Thailand OCA", "พื้นที่อ้างสิทธิทับซ้อน (อ่าวไทย)", 8.0, 102.5)),
    # ---- จุดเกิดเหตุ (point) ท่าเรือ/เกาะ/หาด/ปากน้ำ ----
    (re.compile(r"laem ?chabang|แหลมฉบัง", re.I), 0, ("Laem Chabang Port", "ท่าเรือแหลมฉบัง", 13.08, 100.88)),
    (re.compile(r"khlong ?toei|คลองเตย|ท่าเรือกรุงเทพ", re.I), 0, ("Bangkok Port", "ท่าเรือกรุงเทพ (คลองเตย)", 13.70, 100.58)),
    (re.compile(r"map ?ta ?phut|มาบตาพุด", re.I), 0, ("Map Ta Phut", "มาบตาพุด", 12.67, 101.15)),
    (re.compile(r"sattahip|สัตหีบ|ฐานทัพเรือสัตหีบ|อู่ตะเภา|u[- ]?tapao", re.I), 0, ("Sattahip", "สัตหีบ", 12.63, 100.90)),
    (re.compile(r"ท่าเรือสงขลา|songkhla ?port", re.I), 0, ("Songkhla Port", "ท่าเรือสงขลา", 7.21, 100.59)),
    (re.compile(r"pak ?bara|ปากบารา", re.I), 0, ("Pak Bara", "ปากบารา (สตูล)", 6.86, 99.72)),
    (re.compile(r"laem ?ngop|แหลมงอบ", re.I), 0, ("Laem Ngop", "แหลมงอบ (ตราด)", 12.18, 102.39)),
    (re.compile(r"khlong ?yai|คลองใหญ่|หาดเล็ก", re.I), 0, ("Khlong Yai", "คลองใหญ่ (ตราด)", 11.78, 102.88)),
    (re.compile(r"ban ?phe|บ้านเพ", re.I), 0, ("Ban Phe", "บ้านเพ (ระยอง)", 12.63, 101.44)),
    (re.compile(r"don ?sak|ดอนสัก", re.I), 0, ("Don Sak", "ดอนสัก (สุราษฎร์ธานี)", 9.31, 99.69)),
    (re.compile(r"ท่าเรือระนอง|ranong ?port|เกาะสอง|kawthaung", re.I), 0, ("Ranong Port", "ท่าเรือระนอง", 9.94, 98.60)),
    (re.compile(r"ปากน้ำชุมพร|หลังสวน", re.I), 0, ("Pak Nam Chumphon", "ปากน้ำชุมพร", 10.47, 99.23)),
    (re.compile(r"ko ?kut|koh ?kood|เกาะกูด", re.I), 0, ("Ko Kut", "เกาะกูด", 11.65, 102.58)),
    (re.compile(r"koh ?kong|เกาะกง", re.I), 0, ("Koh Kong", "เกาะกง", 11.60, 103.00)),
    (re.compile(r"ko(?:h)? ?chang|เกาะช้าง", re.I), 0, ("Ko Chang", "เกาะช้าง (ตราด)", 12.05, 102.32)),
    (re.compile(r"ko(?:h)? ?samet|เกาะเสม็ด", re.I), 0, ("Ko Samet", "เกาะเสม็ด", 12.57, 101.45)),
    (re.compile(r"ko(?:h)? ?larn|เกาะล้าน", re.I), 0, ("Ko Larn", "เกาะล้าน", 12.92, 100.79)),
    (re.compile(r"ko(?:h)? ?sichang|เกาะสีชัง", re.I), 0, ("Ko Sichang", "เกาะสีชัง", 13.16, 100.81)),
    (re.compile(r"ko(?:h)? ?samui|เกาะสมุย|สมุย", re.I), 0, ("Ko Samui", "เกาะสมุย", 9.51, 100.01)),
    (re.compile(r"ko(?:h)? ?pha ?ngan|เกาะพะงัน", re.I), 0, ("Ko Pha Ngan", "เกาะพะงัน", 9.75, 100.03)),
    (re.compile(r"ko(?:h)? ?tao|เกาะเต่า", re.I), 0, ("Ko Tao", "เกาะเต่า", 10.10, 99.84)),
    (re.compile(r"phi ?phi|เกาะพีพี|พีพี", re.I), 0, ("Ko Phi Phi", "เกาะพีพี", 7.74, 98.78)),
    (re.compile(r"ko(?:h)? ?lanta|เกาะลันตา", re.I), 0, ("Ko Lanta", "เกาะลันตา", 7.55, 99.05)),
    (re.compile(r"tarutao|ตะรุเตา", re.I), 0, ("Ko Tarutao", "เกาะตะรุเตา", 6.68, 99.65)),
    (re.compile(r"lipe|หลีเป๊ะ", re.I), 0, ("Ko Lipe", "เกาะหลีเป๊ะ", 6.49, 99.30)),
    (re.compile(r"similan|สิมิลัน", re.I), 0, ("Similan Islands", "หมู่เกาะสิมิลัน", 8.65, 97.64)),
    (re.compile(r"surin ?islands|หมู่เกาะสุรินทร์", re.I), 0, ("Surin Islands", "หมู่เกาะสุรินทร์", 9.42, 97.87)),
    (re.compile(r"ko(?:h)? ?phayam|เกาะพยาม", re.I), 0, ("Ko Phayam", "เกาะพยาม (ระนอง)", 9.75, 98.42)),
    (re.compile(r"\bpattaya\b|พัทยา", re.I), 0, ("Pattaya", "พัทยา", 12.93, 100.88)),
    (re.compile(r"bang ?saen|บางแสน", re.I), 0, ("Bang Saen", "บางแสน", 13.28, 100.92)),
    (re.compile(r"hua ?hin|หัวหิน", re.I), 0, ("Hua Hin", "หัวหิน", 12.57, 99.96)),
    (re.compile(r"cha[- ]?am|ชะอำ", re.I), 0, ("Cha-am", "ชะอำ", 12.80, 99.97)),
    (re.compile(r"patong|ป่าตอง", re.I), 0, ("Patong Beach", "หาดป่าตอง (ภูเก็ต)", 7.89, 98.30)),
    (re.compile(r"ao ?manao|อ่าวมะนาว", re.I), 0, ("Ao Manao", "อ่าวมะนาว (ประจวบฯ)", 11.77, 99.82)),
    (re.compile(r"samae ?san|แสมสาร", re.I), 0, ("Samae San", "อ่าวแสมสาร (ชลบุรี)", 12.60, 100.95)),
    (re.compile(r"ปากน้ำเจ้าพระยา|ปากน้ำสมุทรปราการ", re.I), 0, ("Chao Phraya Mouth", "ปากน้ำเจ้าพระยา", 13.55, 100.59)),
    (re.compile(r"ปากน้ำแม่กลอง", re.I), 0, ("Mae Klong Mouth", "ปากน้ำแม่กลอง", 13.38, 100.00)),
    (re.compile(r"ปากน้ำท่าจีน", re.I), 0, ("Tha Chin Mouth", "ปากน้ำท่าจีน", 13.45, 100.28)),
    (re.compile(r"ปากน้ำระยอง", re.I), 0, ("Rayong River Mouth", "ปากน้ำระยอง", 12.66, 101.28)),
    (re.compile(r"ปากน้ำกระบี่", re.I), 0, ("Krabi River Mouth", "ปากน้ำกระบี่", 8.06, 98.92)),
    (re.compile(r"ปากพนัง", re.I), 0, ("Pak Phanang", "ปากพนัง (นครศรีฯ)", 8.35, 100.20)),
    (re.compile(r"ปากน้ำปราณ|ปราณบุรี", re.I), 0, ("Pran Buri Mouth", "ปากน้ำปราณบุรี", 12.40, 99.98)),
    # ---- เฉพาะเจาะจง (specific) จังหวัด/ช่องแคบ/เมืองท่า ----
    (re.compile(r"narathiwat|นราธิวาส|สุคิริน|ตากใบ|ระแงะ|เจาะไอร้อง", re.I), 1, ("Narathiwat", "นราธิวาส", 6.43, 101.82)),
    (re.compile(r"\bpattani\b|ปัตตานี|สายบุรี|หนองจิก", re.I), 1, ("Pattani", "ปัตตานี", 6.87, 101.25)),
    (re.compile(r"\byala\b|ยะลา|เบตง|บันนังสตา", re.I), 1, ("Yala", "ยะลา", 6.54, 101.28)),
    (re.compile(r"songkhla|สงขลา|หาดใหญ่|สะเดา|ทะเลสาบสงขลา", re.I), 1, ("Songkhla", "สงขลา", 7.20, 100.60)),
    (re.compile(r"\bsatun\b|สตูล", re.I), 1, ("Satun", "สตูล", 6.62, 100.07)),
    (re.compile(r"\btak\b|จังหวัดตาก|แม่สอด|mae ?sot|ท่าสายลวด|แม่กุ", re.I), 1, ("Tak", "ตาก", 16.87, 99.13)),
    (re.compile(r"mae ?hong ?son|แม่ฮ่องสอน", re.I), 1, ("Mae Hong Son", "แม่ฮ่องสอน", 19.30, 97.97)),
    (re.compile(r"chiang ?rai|เชียงราย|แม่สาย|เชียงแสน|เชียงของ", re.I), 1, ("Chiang Rai", "เชียงราย", 19.91, 99.83)),
    (re.compile(r"chiang ?mai|เชียงใหม่", re.I), 1, ("Chiang Mai", "เชียงใหม่", 18.79, 98.98)),
    (re.compile(r"kanchanaburi|กาญจนบุรี|สังขละบุรี|ด่านเจดีย์สามองค์", re.I), 1, ("Kanchanaburi", "กาญจนบุรี", 14.02, 99.53)),
    (re.compile(r"\branong\b|ระนอง", re.I), 1, ("Ranong", "ระนอง", 9.96, 98.63)),
    (re.compile(r"nong ?khai|หนองคาย", re.I), 1, ("Nong Khai", "หนองคาย", 17.88, 102.74)),
    (re.compile(r"nakhon ?phanom|นครพนม", re.I), 1, ("Nakhon Phanom", "นครพนม", 17.41, 104.78)),
    (re.compile(r"mukdahan|มุกดาหาร", re.I), 1, ("Mukdahan", "มุกดาหาร", 16.54, 104.72)),
    (re.compile(r"ubon ?ratchathani|อุบลราชธานี|ช่องเม็ก", re.I), 1, ("Ubon Ratchathani", "อุบลราชธานี", 15.24, 104.85)),
    (re.compile(r"sa ?kaeo|สระแก้ว|อรัญประเทศ|คลองลึก", re.I), 1, ("Sa Kaeo", "สระแก้ว", 13.82, 102.07)),
    (re.compile(r"chanthaburi|จันทบุรี", re.I), 1, ("Chanthaburi", "จันทบุรี", 12.61, 102.10)),
    (re.compile(r"\brayong\b|ระยอง|มาบตาพุด", re.I), 1, ("Rayong", "ระยอง", 12.68, 101.25)),
    (re.compile(r"chon ?buri|ชลบุรี|พัทยา|แหลมฉบัง|สัตหีบ|เกาะสีชัง", re.I), 1, ("Chon Buri", "ชลบุรี", 13.36, 100.98)),
    (re.compile(r"samut ?prakan|สมุทรปราการ|บางปู", re.I), 1, ("Samut Prakan", "สมุทรปราการ", 13.60, 100.60)),
    (re.compile(r"samut ?sakhon|สมุทรสาคร|มหาชัย", re.I), 1, ("Samut Sakhon", "สมุทรสาคร", 13.55, 100.27)),
    (re.compile(r"samut ?songkhram|สมุทรสงคราม", re.I), 1, ("Samut Songkhram", "สมุทรสงคราม", 13.41, 100.00)),
    (re.compile(r"phetchaburi|เพชรบุรี|ชะอำ", re.I), 1, ("Phetchaburi", "เพชรบุรี", 13.11, 99.94)),
    (re.compile(r"prachuap|ประจวบคีรีขันธ์|หัวหิน|บางสะพาน", re.I), 1, ("Prachuap Khiri Khan", "ประจวบคีรีขันธ์", 11.81, 99.80)),
    (re.compile(r"\bchumphon\b|ชุมพร", re.I), 1, ("Chumphon", "ชุมพร", 10.49, 99.18)),
    (re.compile(r"surat ?thani|สุราษฎร์ธานี|เกาะสมุย|เกาะพะงัน|เกาะเต่า", re.I), 1, ("Surat Thani", "สุราษฎร์ธานี", 9.14, 99.33)),
    (re.compile(r"nakhon ?si ?thammarat|นครศรีธรรมราช|ขนอม", re.I), 1, ("Nakhon Si Thammarat", "นครศรีธรรมราช", 8.43, 99.96)),
    (re.compile(r"phatthalung|พัทลุง", re.I), 1, ("Phatthalung", "พัทลุง", 7.62, 100.08)),
    (re.compile(r"\bphuket\b|ภูเก็ต", re.I), 1, ("Phuket", "ภูเก็ต", 7.88, 98.39)),
    (re.compile(r"\bkrabi\b|กระบี่", re.I), 1, ("Krabi", "กระบี่", 8.09, 98.91)),
    (re.compile(r"phang ?nga|พังงา|เขาหลัก", re.I), 1, ("Phang Nga", "พังงา", 8.45, 98.53)),
    (re.compile(r"(?<!nha[ -])\btrang\b|ตรัง", re.I), 1, ("Trang", "ตรัง", 7.56, 99.61)),
    (re.compile(r"bangkok|กรุงเทพ|กทม\.?|จอมทอง|หนองแขม|บางมด|พระราม 2|ดอนเมือง|สุวรรณภูมิ|suvarnabhumi", re.I), 1, ("Bangkok", "กรุงเทพมหานคร", 13.75, 100.52)),
    (re.compile(r"nonthaburi|นนทบุรี", re.I), 1, ("Nonthaburi", "นนทบุรี", 13.86, 100.51)),
    (re.compile(r"pathum ?thani|ปทุมธานี", re.I), 1, ("Pathum Thani", "ปทุมธานี", 14.02, 100.53)),
    (re.compile(r"ayutthaya|อยุธยา|วังน้อย", re.I), 1, ("Ayutthaya", "พระนครศรีอยุธยา", 14.35, 100.58)),
    (re.compile(r"saraburi|สระบุรี|หนองโดน", re.I), 1, ("Saraburi", "สระบุรี", 14.53, 100.91)),
    (re.compile(r"nakhon ?sawan|นครสวรรค์|ตาคลี|หนองโพ", re.I), 1, ("Nakhon Sawan", "นครสวรรค์", 15.70, 100.14)),
    (re.compile(r"phitsanulok|พิษณุโลก|วังทอง|บางกระทุ่ม", re.I), 1, ("Phitsanulok", "พิษณุโลก", 16.82, 100.26)),
    (re.compile(r"phichit|พิจิตร", re.I), 1, ("Phichit", "พิจิตร", 16.44, 100.35)),
    (re.compile(r"phetchabun|เพชรบูรณ์", re.I), 1, ("Phetchabun", "เพชรบูรณ์", 16.42, 101.16)),
    (re.compile(r"khon ?kaen|ขอนแก่น|ภูผาม่าน|ห้วยม่วง|แวงน้อย", re.I), 1, ("Khon Kaen", "ขอนแก่น", 16.44, 102.83)),
    (re.compile(r"nakhon ?ratchasima|นครราชสีมา|โคราช", re.I), 1, ("Nakhon Ratchasima", "นครราชสีมา", 14.97, 102.10)),
    (re.compile(r"udon ?thani|อุดรธานี", re.I), 1, ("Udon Thani", "อุดรธานี", 17.41, 102.79)),
    (re.compile(r"chaiyaphum|ชัยภูมิ|บ้านเล่า", re.I), 1, ("Chaiyaphum", "ชัยภูมิ", 15.81, 102.03)),
    (re.compile(r"\bsurin\b|สุรินทร์", re.I), 1, ("Surin", "สุรินทร์", 14.88, 103.49)),
    (re.compile(r"buri ?ram|บุรีรัมย์", re.I), 1, ("Buri Ram", "บุรีรัมย์", 14.99, 103.10)),
    (re.compile(r"nan ?province|(?:จังหวัด|จ\.\s?)น่าน|เมืองน่าน|เวียงสา|ท่าวังผา|อ\.\s?ปัว", re.I), 1, ("Nan", "น่าน", 18.78, 100.78)),
    (re.compile(r"\bphrae\b|(?:จังหวัด|จ\.\s?)แพร่|เมืองแพร่|อ\.\s?เด่นชัย|สูงเม่น", re.I), 1, ("Phrae", "แพร่", 18.14, 100.14)),
    (re.compile(r"lampang|ลำปาง|เถิน|แม่เมาะ", re.I), 1, ("Lampang", "ลำปาง", 18.29, 99.49)),
    (re.compile(r"lamphun|ลำพูน|ป่าซาง", re.I), 1, ("Lamphun", "ลำพูน", 18.58, 99.01)),
    (re.compile(r"phayao|พะเยา|เชียงคำ|ดอกคำใต้", re.I), 1, ("Phayao", "พะเยา", 19.17, 99.90)),
    (re.compile(r"uttaradit|อุตรดิตถ์|ท่าปลา|น้ำปาด", re.I), 1, ("Uttaradit", "อุตรดิตถ์", 17.62, 100.10)),
    (re.compile(r"sukhothai|สุโขทัย|ศรีสัชนาลัย|สวรรคโลก", re.I), 1, ("Sukhothai", "สุโขทัย", 17.01, 99.82)),
    (re.compile(r"kamphaeng ?phet|กำแพงเพชร|คลองลาน", re.I), 1, ("Kamphaeng Phet", "กำแพงเพชร", 16.48, 99.52)),
    (re.compile(r"uthai ?thani|อุทัยธานี|ห้วยคต", re.I), 1, ("Uthai Thani", "อุทัยธานี", 15.38, 100.02)),
    (re.compile(r"chai ?nat|ชัยนาท|สรรพยา|เขื่อนเจ้าพระยา", re.I), 1, ("Chai Nat", "ชัยนาท", 15.19, 100.13)),
    (re.compile(r"sing ?buri|สิงห์บุรี|อินทร์บุรี", re.I), 1, ("Sing Buri", "สิงห์บุรี", 14.89, 100.40)),
    (re.compile(r"ang ?thong|อ่างทอง|ป่าโมก", re.I), 1, ("Ang Thong", "อ่างทอง", 14.59, 100.46)),
    (re.compile(r"lop ?buri|ลพบุรี|บ้านหมี่|ชัยบาดาล", re.I), 1, ("Lop Buri", "ลพบุรี", 14.80, 100.65)),
    (re.compile(r"suphan ?buri|สุพรรณบุรี|บางปลาม้า|สองพี่น้อง", re.I), 1, ("Suphan Buri", "สุพรรณบุรี", 14.47, 100.12)),
    (re.compile(r"nakhon ?pathom|นครปฐม|สามพราน|นครชัยศรี", re.I), 1, ("Nakhon Pathom", "นครปฐม", 13.82, 100.06)),
    (re.compile(r"ratchaburi|ราชบุรี|ดำเนินสะดวก|บ้านโป่ง", re.I), 1, ("Ratchaburi", "ราชบุรี", 13.53, 99.81)),
    (re.compile(r"nakhon ?nayok|นครนายก|บ้านนา|องครักษ์", re.I), 1, ("Nakhon Nayok", "นครนายก", 14.20, 101.21)),
    (re.compile(r"prachin ?buri|ปราจีนบุรี|กบินทร์บุรี|ศรีมหาโพธิ", re.I), 1, ("Prachin Buri", "ปราจีนบุรี", 14.05, 101.37)),
    (re.compile(r"chachoengsao|ฉะเชิงเทรา|แปดริ้ว|บางปะกง|บางคล้า", re.I), 1, ("Chachoengsao", "ฉะเชิงเทรา", 13.69, 101.07)),
    (re.compile(r"kalasin|กาฬสินธุ์|เขื่อนลำปาว|ยางตลาด", re.I), 1, ("Kalasin", "กาฬสินธุ์", 16.43, 103.51)),
    (re.compile(r"roi ?et|ร้อยเอ็ด|เสลภูมิ|โพนทอง", re.I), 1, ("Roi Et", "ร้อยเอ็ด", 16.06, 103.65)),
    (re.compile(r"maha ?sarakham|มหาสารคาม|โกสุมพิสัย", re.I), 1, ("Maha Sarakham", "มหาสารคาม", 16.18, 103.30)),
    (re.compile(r"sakon ?nakhon|สกลนคร|หนองหาร|สว่างแดนดิน", re.I), 1, ("Sakon Nakhon", "สกลนคร", 17.16, 104.15)),
    (re.compile(r"bueng ?kan|บึงกาฬ|ปากคาด|เซกา", re.I), 1, ("Bueng Kan", "บึงกาฬ", 18.36, 103.65)),
    (re.compile(r"nong ?bua ?lam ?phu|หนองบัวลำภู|ศรีบุญเรือง", re.I), 1, ("Nong Bua Lam Phu", "หนองบัวลำภู", 17.20, 102.44)),
    (re.compile(r"\bloei\b|(?:จังหวัด|จ\.\s?)เลย|เมืองเลย|เชียงคาน|ภูเรือ|ด่านซ้าย", re.I), 1, ("Loei", "เลย", 17.49, 101.73)),
    (re.compile(r"yasothon|ยโสธร|เลิงนกทา|มหาชนะชัย", re.I), 1, ("Yasothon", "ยโสธร", 15.79, 104.15)),
    (re.compile(r"amnat ?charoen|อำนาจเจริญ|ชานุมาน", re.I), 1, ("Amnat Charoen", "อำนาจเจริญ", 15.86, 104.63)),
    (re.compile(r"si ?sa ?ket|ศรีสะเกษ|กันทรลักษ์|ขุนหาญ", re.I), 1, ("Si Sa Ket", "ศรีสะเกษ", 15.12, 104.32)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"gulf of thailand|อ่าวไทย|ท้องอ่าว", re.I), 2, ("Gulf of Thailand", "อ่าวไทย", 9.5, 101.5)),
    (re.compile(r"andaman|ทะเลอันดามัน|อนุดามัน", re.I), 2, ("Andaman Sea", "ทะเลอันดามัน", 8.0, 97.0)),
    # ---- ระดับประเทศ/มหาสมุทร (country) — กว้างสุด ความมั่นใจต่ำสุด ----
    (re.compile(r"\bthailand\b|\bthai\b|ประเทศไทย|ในไทย|ราชอาณาจักรไทย", re.I), 3, ("Thailand", "ประเทศไทย", 13.75, 100.52)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"natuna|นาตูนา", re.I), 2, ("North Natuna Sea", "ทะเลนาตูนาเหนือ", 5.0, 109.2)),
    (re.compile(r"black sea|novorossiysk|odes[as]|crimea|ทะเลดำ|โนโวรอสซีสค์", re.I), 2, ("Black Sea", "ทะเลดำ", 44.0, 36.0)),
    (re.compile(r"baltic|gulf of finland|kattegat|gotland|ทะเลบอลติก|บอลติก", re.I), 2, ("Baltic Sea", "ทะเลบอลติก", 59.0, 21.0)),
    (re.compile(r"gulf of guinea|nigeria|lagos|อ่าวกินี", re.I), 2, ("Gulf of Guinea", "อ่าวกินี", 3.0, 5.0)),
    (re.compile(r"somali|horn of africa|gulf of oman|arabian sea|สโมลี|โซมาเลีย|ทะเลอาหรับ", re.I), 2, ("Arabian Sea / Horn", "ทะเลอาหรับ / จะงอยแอฟริกา", 12.0, 55.0)),
    (re.compile(r"caribbean|venezuela|panama canal|ทะเลแคริบเบียน", re.I), 2, ("Caribbean Sea", "ทะเลแคริบเบียน", 14.0, -72.0)),
    # ---- ระดับประเทศ/มหาสมุทร (country) — กว้างสุด ความมั่นใจต่ำสุด ----
    (re.compile(r"\brhine\b|duisburg|แม่น้ำไรน์", re.I), 3, ("Rhine (Germany)", "แม่น้ำไรน์ (เยอรมนี)", 51.4, 6.8)),
    (re.compile(r"\bdanube\b|แม่น้ำดานูบ", re.I), 3, ("Danube", "แม่น้ำดานูบ", 45.4, 19.3)),
    # ---- เฉพาะเจาะจง (specific) จังหวัด/ช่องแคบ/เมืองท่า ----
    (re.compile(r"rotterdam|antwerp|ร็อตเตอร์ดัม", re.I), 1, ("Rotterdam–Antwerp", "ร็อตเตอร์ดัม–แอนต์เวิร์ป", 51.9, 4.1)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"shanghai|ningbo|qingdao|\bwuhu\b|yangtze|เซี่ยงไฮ้", re.I), 2, ("East China Coast", "ชายฝั่งจีนตะวันออก", 31.0, 122.5)),
    # ---- ระดับประเทศ/มหาสมุทร (country) — กว้างสุด ความมั่นใจต่ำสุด ----
    (re.compile(r"yokosuka|\btokyo\b|\bosaka\b|โยโกสุกะ", re.I), 3, ("Japan", "ญี่ปุ่น", 35.2, 139.7)),
    (re.compile(r"\bbusan\b|incheon|ปูซาน", re.I), 3, ("South Korea", "เกาหลีใต้", 35.1, 129.1)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"norfolk|wallops|chesapeake|newport news", re.I), 2, ("US East Coast", "ชายฝั่งตะวันออกสหรัฐฯ", 36.9, -76.0)),
    (re.compile(r"pearl harbor|\bguam\b|เพิร์ลฮาร์เบอร์", re.I), 2, ("West Pacific (US)", "แปซิฟิกตะวันตก (สหรัฐฯ)", 21.3, -157.9)),
    (re.compile(r"santos|petrobras|rio de janeiro|\bbrazil", re.I), 2, ("Brazil / S. Atlantic", "บราซิล / แอตแลนติกใต้", -23.5, -43.0)),
    # ---- ระดับประเทศ/มหาสมุทร (country) — กว้างสุด ความมั่นใจต่ำสุด ----
    (re.compile(r"argentin|river plate|parana river|buenos aires", re.I), 3, ("Argentina", "อาร์เจนตินา", -35.0, -57.0)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"royal navy|\buk\b|united kingdom|britain|british|portsmouth|devonport|ราชนาวีอังกฤษ|อังกฤษ", re.I), 2, ("United Kingdom / North Sea", "สหราชอาณาจักร / ทะเลเหนือ", 55.0, 1.0)),
    # ---- ระดับประเทศ/มหาสมุทร (country) — กว้างสุด ความมั่นใจต่ำสุด ----
    (re.compile(r"netherlands|dutch|\brnln\b|hnlms|เนเธอร์แลนด์", re.I), 3, ("Netherlands", "เนเธอร์แลนด์", 52.6, 4.2)),
    (re.compile(r"\bgermany\b|german navy|rheinmetall|\bfgs\b|เยอรมนี", re.I), 3, ("Germany", "เยอรมนี", 54.2, 8.5)),
    (re.compile(r"\bspain\b|spanish navy|\bindra\b|ferrol|cadiz|สเปน", re.I), 3, ("Spain", "สเปน", 42.5, -9.5)),
    (re.compile(r"\bitaly\b|italian navy|sicily|\bgenoa\b|อิตาลี", re.I), 3, ("Italy", "อิตาลี", 40.0, 13.5)),
    (re.compile(r"\bgreece\b|greek|piraeus|กรีซ", re.I), 3, ("Greece", "กรีซ", 37.5, 24.5)),
    (re.compile(r"\bmalta\b|มอลตา", re.I), 3, ("Malta", "มอลตา", 35.9, 14.5)),
    (re.compile(r"\bturkey\b|turkish|\biraq\b|ตุรกี|อิรัก", re.I), 3, ("Turkey–Iraq", "ตุรกี–อิรัก", 36.8, 35.0)),
    (re.compile(r"\bhungary\b|ฮังการี", re.I), 3, ("Hungary (C. Europe)", "ฮังการี (ยุโรปกลาง)", 47.5, 19.0)),
    (re.compile(r"\bcanada\b|canadian|แคนาดา", re.I), 3, ("Canada", "แคนาดา", 48.5, -63.0)),
    (re.compile(r"\baustralia\b|\brann\b|australian navy|ออสเตรเลีย", re.I), 3, ("Australia", "ออสเตรเลีย", -33.9, 151.5)),
    (re.compile(r"\bindia\b|indian navy|mumbai|cochin|hindustan|อินเดีย", re.I), 3, ("India", "อินเดีย", 18.9, 72.5)),
    (re.compile(r"\bchina\b|chinese|จีน", re.I), 3, ("China", "จีน", 30.0, 123.0)),
    (re.compile(r"jones act|\bus navy\b|u\.s\. navy|american|white house|virginia-class|saildrone|สหรัฐ", re.I), 3, ("United States", "สหรัฐอเมริกา", 38.0, -74.0)),
    # ---- เฉพาะเจาะจง (specific) จังหวัด/ช่องแคบ/เมืองท่า ----
    (re.compile(r"english channel|dover strait|pas de calais|ช่องแคบอังกฤษ", re.I), 1, ("English Channel", "ช่องแคบอังกฤษ", 50.3, 0.5)),
    (re.compile(r"panama canal|\bpanama\b|คลองปานามา", re.I), 1, ("Panama Canal", "คลองปานามา", 9.1, -79.7)),
    (re.compile(r"suez canal|\bsuez\b|คลองสุเอซ", re.I), 1, ("Suez Canal", "คลองสุเอซ", 30.5, 32.35)),
    (re.compile(r"gibraltar|ยิบรอลตาร์", re.I), 1, ("Strait of Gibraltar", "ช่องแคบยิบรอลตาร์", 35.95, -5.6)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"philippines?|philippine|manila|luzon|palawan|subic|ฟิลิปปินส์", re.I), 2, ("Philippines", "ฟิลิปปินส์", 13.0, 122.0)),
    # ---- ระดับประเทศ/มหาสมุทร (country) — กว้างสุด ความมั่นใจต่ำสุด ----
    (re.compile(r"indonesia|indonesian|jakarta|surabaya|batam|อินโดนีเซีย", re.I), 3, ("Indonesia", "อินโดนีเซีย", -2.5, 118.0)),
    (re.compile(r"vietnam|viet nam|vietnamese|haiphong|da nang|เวียดนาม", re.I), 3, ("Vietnam", "เวียดนาม", 16.0, 109.0)),
    (re.compile(r"\btaiwan\b|kaohsiung|ไต้หวัน", re.I), 3, ("Taiwan", "ไต้หวัน", 24.0, 121.5)),
    (re.compile(r"north korea|dprk|pyongyang|เกาหลีเหนือ", re.I), 3, ("North Korea", "เกาหลีเหนือ", 39.0, 127.5)),
    (re.compile(r"sri lanka|colombo|ศรีลังกา", re.I), 3, ("Sri Lanka", "ศรีลังกา", 6.9, 79.8)),
    # ---- น่านน้ำ/ทะเลที่มีชื่อเฉพาะ (water) ----
    (re.compile(r"mediterranean|aegean|libya|gaza|ทะเลเมดิเตอร์", re.I), 2, ("Mediterranean Sea", "ทะเลเมดิเตอร์เรเนียน", 34.0, 18.0)),
    (re.compile(r"north sea|norway|norwegian|denmark|ทะเลเหนือ|นอร์เวย์", re.I), 2, ("North Sea", "ทะเลเหนือ", 56.5, 3.0)),
    (re.compile(r"arctic|icebreaker|svalbard|greenland|อาร์กติก|เรือตัดน้ำแข็ง", re.I), 2, ("Arctic Ocean", "มหาสมุทรอาร์กติก", 78.0, 15.0)),
    (re.compile(r"indian ocean|มหาสมุทรอินเดีย", re.I), 2, ("Indian Ocean", "มหาสมุทรอินเดีย", 5.0, 75.0)),
    (re.compile(r"pacific|แปซิฟิก", re.I), 2, ("Pacific Ocean", "มหาสมุทรแปซิฟิก", 5.0, 175.0)),
    (re.compile(r"atlantic|แอตแลนติก", re.I), 2, ("Atlantic Ocean", "มหาสมุทรแอตแลนติก", 28.0, -40.0)),
]

SEV_CRIT = re.compile(r"\b(attack|attacked|missile|drone strike|explosion|struck|killed|sunk|sinking|hijack|seized|under fire|ballistic)\b", re.I)
# ไม่ปิดท้ายด้วย \b — รายการนี้เป็น "รากคำ" ไม่ใช่คำเต็ม ปิดท้ายแล้ว seiz/capsiz/
# smuggl จะไม่มีวันตรงกับอะไร (ไม่มีคำว่า "seiz") และ detain/intercept จะไม่จับ
# detained/intercepted · เปิดท้ายไว้จึงครอบ seized · capsized · smuggling
# (บั๊กเดียวกันกับ EV_SEV_HIGH ใน events-feed.jsx — แก้พร้อมกันให้ยังตรงกัน)
SEV_HIGH = re.compile(r"\b(seiz|detain|collision|capsiz|distress|piracy|pirate|smuggl|illegal fishing|incursion|intercept|boarded|sabotage|cable)", re.I)

THREAT_CATS = [
    ("SEARCH & RESCUE",     re.compile(r"rescue|distress|capsiz|sinking|missing|overboard|search and rescue", re.I)),
    ("PIRACY",              re.compile(r"piracy|pirate|armed robbery|hijack|kidnap", re.I)),
    ("IUU FISHING",         re.compile(r"illegal fishing|\biuu\b|trawler|poach", re.I)),
    ("MARITIME TERRORISM",  re.compile(r"houthi|missile|drone|attack|explosion|struck|militant|terror", re.I)),
    ("DRUG & ARMS",         re.compile(r"drug|narcotic|smuggl|contraband|weapons? seiz", re.I)),
    ("SUBSEA / INFRA",      re.compile(r"cable|pipeline|sabotage|infrastructure", re.I)),
]


def _ev_text(a):
    """ข้อความที่ใช้ "หาพื้นที่" — ภาษาต้นฉบับเท่านั้น

    ⚠ ห้ามใส่ title_th / summary_th ซึ่งเป็นคำแปลจาก Google
      เคยใส่แล้วเกิดบั๊กจริง: ข่าว MAREX เรื่องอ่าวเปอร์เซียถูกแปลว่า
      "ความขัดแย้งในอ่าวไทย" แล้วกฎ "อ่าวไทย" จับได้ เหตุการณ์จึงไปโผล่
      กลางอ่าวไทย ทั้งที่ข้อความอังกฤษต้นฉบับไม่ตรงกับกฎไหนเลย
      คำแปลไม่ใช่หลักฐานทางภูมิศาสตร์ — มันสร้างสถานที่ขึ้นมาใหม่ได้
    """
    return " ".join([a.get("title", ""), a.get("desc", "")])


def _sev_text(a):
    """ข้อความที่ใช้ "จัดระดับความรุนแรง/หมวดภัย" — ใช้คำแปลได้

    ต่างจากพื้นที่ตรงที่คำว่า "โจมตี" หรือ "ระเบิด" ในคำแปลก็ยังหมายถึง
    สิ่งเดียวกับต้นฉบับ ไม่ได้ย้ายเหตุการณ์ไปไหน
    """
    return " ".join([a.get("title", ""), a.get("desc", ""),
                     a.get("title_th", "") or "", a.get("summary_th", "") or ""])


def to_event_row(a):
    geo_text = _ev_text(a)      # ต้นฉบับเท่านั้น — ใช้หาพื้นที่
    sev_text = _sev_text(a)     # รวมคำแปล — ใช้จัดระดับภัย

    # ต้องระบุพื้นที่ทางทะเลได้ (เพื่อขึ้นหมุดบนแผนที่)
    # เลือกกฎที่ "เจาะจงที่สุด" ไม่ใช่กฎแรกที่เจอ — ของเดิมให้ลำดับบรรทัด
    # ในไฟล์เป็นตัวตัดสิน ซึ่งไม่ใช่เหตุผลทางภูมิศาสตร์อะไรเลย
    hits = []
    for rx, rank, info in REGIONS:
        m = rx.search(geo_text)
        if m:
            hits.append((rank, info, m.group(0)))
    if not hits:
        return None
    best_rank, geo, hit_text = min(hits, key=lambda h: h[0])

    # สถานะและความมั่นใจตามความเฉพาะเจาะจง — ต้องตรงกับ GEO_GRADE ใน events-feed.jsx
    # ไม่มีระดับ "verified" ที่นี่: การจับคู่คำไม่ใช่การยืนยัน
    # verified สงวนไว้ให้เจ้าหน้าที่กดยืนยันเองในหน้าเหตุการณ์เท่านั้น
    loc_status, loc_conf = [("probable", 0.90), ("probable", 0.85),
                            ("approximate", 0.60), ("unverified", 0.35)][min(best_rank, 3)]

    # ต้องมีสัญญาณภัย: ความรุนแรง หรือ เข้าหมวดภัยคุกคามชัดเจน
    sev = "critical" if SEV_CRIT.search(sev_text) else ("high" if SEV_HIGH.search(sev_text) else None)
    cat = None
    for name, rx in THREAT_CATS:
        if rx.search(sev_text):
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
        "loc_status":     loc_status,
        "loc_confidence": loc_conf,
        "loc_evidence":   hit_text,
        "loc_source":     "rule",
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
    rows = dedupe_by_id([to_row(a) for a in arts])
    status = upsert(rows)

    # สร้างเหตุการณ์จากข่าวภัยสูงที่ระบุพื้นที่ได้
    # id ของเหตุการณ์ก็เป็น hash ของลิงก์เหมือนกัน จึงซ้ำได้ด้วยเหตุผลเดียวกัน
    event_rows = dedupe_by_id([r for r in (to_event_row(a) for a in arts) if r])
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


# GitHub Actions (.github/workflows/daily-news.yml) รันไฟล์นี้เป็นสคริปต์ตรง ๆ
# ไม่ได้ผ่าน handler ข้างบน — ถ้าไม่มีบล็อกนี้ ไฟล์จะแค่ประกาศฟังก์ชันแล้วจบ
# ด้วย exit code 0 ทำให้ workflow ขึ้นเขียวทุกวันโดยไม่ได้ดูดข่าวเลยสักข่าว
if __name__ == "__main__":
    if not SUPABASE_URL or not SERVICE_KEY:
        raise SystemExit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env")
    result, status_code = run()
    print(json.dumps(result, ensure_ascii=False))
    # ต้องคืน exit code ที่ไม่ใช่ 0 เมื่อพัง ไม่งั้น workflow จะรายงานสำเร็จทั้งที่ล้มเหลว
    raise SystemExit(0 if status_code == 200 else 1)
