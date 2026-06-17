"""
Vercel serverless:  POST /api/analyze
วิเคราะห์ข่าว 1 ชิ้นเชิงลึก สำหรับหน้า "รายละเอียดข่าว"
  • ถ้าตั้ง env ANTHROPIC_API_KEY → ใช้ Claude เขียนบทวิเคราะห์
  • ถ้าไม่มี key → คืนบทประเมินแบบ rule-based (อิงข้อมูลที่มี)

Request JSON: { title, summary, outlet, region, reliability, credibility,
                verdict, threats: [..], lang: "th"|"en" }
Response JSON: { ok, engine: "claude"|"offline", text }
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


def analyze_with_claude(d, lang):
    want_th = (lang != "en")
    lang_line = ("ตอบเป็นภาษาไทย" if want_th else "Answer in English")
    prompt = (
        "You are a senior Thai maritime intelligence analyst supporting Thailand's "
        "Maritime Enforcement Command Centre (Thai-MECC / ศรชล.). " + lang_line + ".\n"
        "Write a concise but substantive assessment of the report below, using exactly "
        "these three headings (keep each to 2-4 sentences):\n"
        "1. สถานการณ์ / SITUATION\n"
        "2. ผลกระทบต่อไทยและภูมิภาค / IMPACT\n"
        "3. ข้อเสนอแนะการปฏิบัติ / RECOMMENDED ACTIONS\n\n"
        "REPORT\n"
        "Headline: " + (d.get("title") or "") + "\n"
        "Summary: " + (d.get("summary") or "") + "\n"
        "Source: " + (d.get("outlet") or "") + "\n"
        "Area: " + (d.get("region") or "unspecified") + "\n"
        "Threat domains: " + ", ".join(d.get("threats") or []) + "\n"
        "Admiralty rating: " + (d.get("reliability") or "?") + str(d.get("credibility") or "?") + "\n"
    )
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 900,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return resp["content"][0]["text"].strip()


REL = {
    "A": ("เชื่อถือได้สมบูรณ์", "Completely reliable"),
    "B": ("เชื่อถือได้เป็นส่วนใหญ่", "Usually reliable"),
    "C": ("เชื่อถือได้พอสมควร", "Fairly reliable"),
    "D": ("มักเชื่อถือไม่ได้", "Not usually reliable"),
    "E": ("เชื่อถือไม่ได้", "Unreliable"),
    "F": ("ประเมินไม่ได้", "Cannot be judged"),
}
CRED = {
    "1": ("ยืนยันแล้ว", "Confirmed"),
    "2": ("น่าจะจริง", "Probably true"),
    "3": ("อาจเป็นจริง", "Possibly true"),
    "4": ("น่าสงสัย", "Doubtful"),
    "5": ("ไม่น่าเป็นจริง", "Improbable"),
}


def analyze_offline(d, lang):
    th = (lang != "en")
    rel = str(d.get("reliability") or "C").upper()[:1]
    cred = str(d.get("credibility") or "3")[:1]
    relx = REL.get(rel, REL["C"])
    crex = CRED.get(cred, CRED["3"])
    region = d.get("region") or ("ไม่ระบุพื้นที่" if th else "unspecified area")
    threats = ", ".join(d.get("threats") or []) or ("ไม่ระบุ" if th else "n/a")
    title = d.get("title") or ""
    summary = d.get("summary") or ""
    if th:
        return (
            "1. สถานการณ์ / SITUATION\n"
            + (summary or title) + " (พื้นที่: " + region + ")\n\n"
            "2. ผลกระทบต่อไทยและภูมิภาค / IMPACT\n"
            "เกี่ยวข้องกับภัยคุกคามด้าน: " + threats + " ควรประเมินผลต่อเส้นทางเดินเรือ "
            "และผลประโยชน์ทางทะเลของไทยในพื้นที่ใกล้เคียง\n\n"
            "3. ข้อเสนอแนะการปฏิบัติ / RECOMMENDED ACTIONS\n"
            "ตรวจสอบยืนยันกับแหล่งข่าวอื่น (ปัจจุบันความน่าเชื่อถือ " + rel + cred +
            " = แหล่ง" + relx[0] + " · ข้อมูล" + crex[0] + ") เฝ้าระวัง AIS ในพื้นที่ "
            "และประสานหน่วยที่เกี่ยวข้องหากยกระดับ\n\n"
            "— โหมดออฟไลน์: ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY จึงเป็นบทประเมินอัตโนมัติจากข้อมูลที่มี"
        )
    return (
        "1. SITUATION\n" + (summary or title) + " (Area: " + region + ")\n\n"
        "2. IMPACT\nRelated threat domains: " + threats + ". Assess effects on sea lanes "
        "and Thai maritime interests in the vicinity.\n\n"
        "3. RECOMMENDED ACTIONS\nCorroborate with other sources (current rating " + rel + cred +
        " = " + relx[1] + " source / " + crex[1] + "). Monitor AIS in the area and "
        "coordinate relevant units if it escalates.\n\n"
        "— Offline mode: ANTHROPIC_API_KEY not configured; this is a rule-based assessment."
    )


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            d = json.loads(self.rfile.read(length) or "{}")
        except Exception:
            d = {}
        lang = d.get("lang", "th")
        if API_KEY:
            try:
                return self._json({"ok": True, "engine": "claude", "text": analyze_with_claude(d, lang)})
            except Exception:
                pass  # ตกไป fallback
        self._json({"ok": True, "engine": "offline", "text": analyze_offline(d, lang)})

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
