"""
MDA Dev Server
  - Serves static files on port 7432
  - POST /api/summarize  → แปลข่าวเป็นไทยด้วย Google Translate (ไม่ต้อง key)
                           ถ้ามี ANTHROPIC_API_KEY จะใช้ Claude สรุปให้ละเอียดกว่า
  - POST /api/analyze    → บทวิเคราะห์ข่าวเชิงลึก (ใช้โค้ดชุดเดียวกับ api/analyze.py
                           ที่รันบน Vercel เพื่อให้ผลลัพธ์บนเครื่องกับบนเว็บตรงกัน)
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.parse
import urllib.error
import argparse
import time
from pathlib import Path

PORT = 7432

# คอนโซล Windows ใช้ cp1252 → print ข้อความไทยแล้วจะ crash ทั้งเซิร์ฟเวอร์
# บังคับ stdout/stderr เป็น UTF-8 ก่อนเสมอ
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def load_dotenv():
    """อ่านไฟล์ .env ข้าง ๆ server.py (ถ้ามี) → ใส่เข้า os.environ
    ไฟล์นี้ถูก .gitignore ไว้แล้ว จึงไม่หลุดขึ้น git
    รูปแบบ:  ANTHROPIC_API_KEY=sk-ant-...   (บรรทัดขึ้นต้นด้วย # คือคอมเมนต์)"""
    path = Path(__file__).parent / ".env"
    if not path.exists():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v
    except Exception as e:
        print("[MDA] อ่าน .env ไม่สำเร็จ:", e)


load_dotenv()
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# ใช้โมดูลชุดเดียวกับฝั่ง production (api/) — ไม่เขียนซ้ำ
sys.path.insert(0, str(Path(__file__).parent / "api"))
import analyze as analyze_mod   # noqa: E402
import chat as chat_mod         # noqa: E402
import rss as rss_mod           # noqa: E402

# ais.py อยู่ที่ root ไม่ใช่ใน api/ เพราะไม่ใช่ serverless function — มันเปิด
# WebSocket ค้างไว้ ซึ่ง serverless ทำไม่ได้ · ถ้าวางใน api/ Vercel จะพยายาม
# build เป็นฟังก์ชันแล้วพังเพราะไม่มี handler
import ais as ais_mod           # noqa: E402


# ── Google Translate (free, no key) ─────────────────────────────────────────

def gtranslate(text, target="th"):
    """Translate text via Google Translate free endpoint."""
    if not text or not text.strip():
        return text
    url = (
        "https://translate.googleapis.com/translate_a/single"
        "?client=gtx&sl=auto&tl=" + target +
        "&dt=t&q=" + urllib.parse.quote(text[:500])
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        parts = data[0]
        return "".join(p[0] for p in parts if p and p[0])
    except Exception:
        return text


def summarize_with_google(items):
    """Translate title + description for each item using Google Translate."""
    results = []
    for i, it in enumerate(items):
        title  = it.get("title", "")
        desc   = it.get("description", "")[:280]
        th_title   = gtranslate(title)
        th_summary = gtranslate(desc) if desc else ""
        results.append({"index": i, "id": it.get("id"), "th_title": th_title, "th_summary": th_summary})
        time.sleep(0.15)   # polite rate-limit
    return results


# ── Claude API (if key provided) ─────────────────────────────────────────────

def summarize_with_claude(items):
    lines = []
    for i, it in enumerate(items):
        lines.append(f'{i+1}. TITLE: {it.get("title","")}\n   DESC: {it.get("description","")[:300]}')

    prompt = (
        "You are a Thai maritime intelligence analyst. "
        "For each item below give:\n"
        "- th_title: concise Thai translation of the title\n"
        "- th_summary: 1-2 sentence Thai summary for a maritime ops dashboard\n\n"
        "Return ONLY a JSON array, one object per item: [{\"index\":0,\"th_title\":\"\",\"th_summary\":\"\"},...]\n\n"
        + "\n\n".join(lines)
    )

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    text  = resp["content"][0]["text"].strip()
    start = text.find("[")
    end   = text.rfind("]") + 1
    return json.loads(text[start:end]) if start != -1 else []


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        """ห้ามเบราว์เซอร์ cache อะไรทั้งสิ้นบนเซิร์ฟเวอร์ dev

        SimpleHTTPRequestHandler ส่งแค่ Last-Modified ไม่ส่ง Cache-Control
        เมื่อไม่มีทั้ง Cache-Control และ Expires เบราว์เซอร์จะเดาอายุเอง
        (heuristic caching, RFC 9111 §4.2.2) ประมาณ 10% ของเวลาที่ผ่านมา
        นับจาก Last-Modified — ไฟล์ที่แก้ไว้ 3 วันก่อนจึงถูกถือว่าสดอีก ~7 ชม.
        โดยไม่ถามเซิร์ฟเวอร์เลย

        ผลคือแก้โค้ดแล้วรีเฟรชก็ยังเห็นของเก่า และการ bump ?v= ใน index.html
        ก็ไม่ช่วย เพราะตัว index.html เองคือไฟล์ที่ค้างอยู่ใน cache
        """
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        return http.server.SimpleHTTPRequestHandler.end_headers(self)

    def do_GET(self):
        route = self.path.split("?")[0]
        if route == "/api/vessels":
            self._json(ais_mod.snapshot())
            return
        if route == "/api/rss":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            try:
                self._json(rss_mod.handle((q.get("url") or [""])[0]))
            except Exception as e:
                self._json({"status": "error", "message": str(e)[:200], "items": []})
            return
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/summarize":
            self._handle_summarize()
        elif self.path == "/api/analyze":
            self._handle_analyze()
        elif self.path == "/api/chat":
            self._handle_chat()
        else:
            self.send_error(404)

    def _handle_chat(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            d = json.loads(self.rfile.read(length) or "{}")
        except Exception:
            d = {}
        chat_mod.API_KEY = API_KEY
        try:
            self._json(chat_mod.handle_chat(d))
        except Exception as e:
            print("[MDA] chat error:", e)
            self._json({"ok": False, "engine": "error", "text": str(e)}, 500)

    def _handle_analyze(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            d = json.loads(self.rfile.read(length) or "{}")
        except Exception:
            d = {}
        lang = d.get("lang", "th")

        analyze_mod.API_KEY = API_KEY          # ให้โมดูลใช้ key เดียวกับเซิร์ฟเวอร์
        if API_KEY:
            try:
                self._json({"ok": True, "engine": "claude",
                            "text": analyze_mod.analyze_with_claude(d, lang)})
                return
            except Exception as e:
                print("[MDA] Claude analyze failed → offline:", e)
        self._json({"ok": True, "engine": "offline",
                    "text": analyze_mod.analyze_offline(d, lang)})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _handle_summarize(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length))
        items  = body.get("items", [])
        if not items:
            self._json({"summaries": []})
            return

        try:
            if API_KEY:
                summaries = summarize_with_claude(items)
            else:
                summaries = summarize_with_google(items)
            self._json({"summaries": summaries})
        except Exception as e:
            # Fallback to Google even if Claude fails
            try:
                summaries = summarize_with_google(items)
                self._json({"summaries": summaries})
            except Exception as e2:
                self._json({"error": str(e2)}, 500)

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--key",  default="", help="Anthropic API key (optional)")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()

    if args.key:
        API_KEY = args.key

    if API_KEY:
        # แสดงแค่ 8 ตัวแรก + 4 ตัวท้าย พอให้ยืนยันว่าโหลดคีย์ถูกใบ ไม่เผยคีย์เต็ม
        masked = API_KEY[:8] + "…" + API_KEY[-4:] if len(API_KEY) > 14 else "…"
        print(f"[MDA] AI: Claude ({masked})  · สรุปข่าว + วิเคราะห์เชิงลึกใช้ LLM")
    else:
        print("[MDA] AI: Google Translate (ฟรี) · วิเคราะห์เชิงลึกใช้โหมด offline")
        print("[MDA] ต้องการใช้ Claude → สร้างไฟล์ .env แล้วใส่  ANTHROPIC_API_KEY=sk-ant-...")

    # ── AIS สด: เปิด WebSocket ค้างไว้ในเธรดพื้นหลัง ──
    if ais_mod.start():
        print("[MDA] AIS: กำลังเชื่อมต่อ AISStream — ตำแหน่งเรือจริงจะทยอยเข้ามา")
    else:
        print("[MDA] AIS: ปิดอยู่ (" + str(ais_mod._state.get("error")) + ")")
        print("[MDA] ต้องการเรือจริง → ขอคีย์ฟรีที่ https://aisstream.io/authenticate")
        print("[MDA] แล้วใส่ในไฟล์ .env:  AISSTREAM_API_KEY=...")

    os.chdir(Path(__file__).parent)
    # ThreadingHTTPServer: จำเป็น เพราะเบราว์เซอร์เปิด keep-alive ค้างไว้
    # ถ้าใช้ HTTPServer ธรรมดา คำขอ /api/analyze (ซึ่งอาจใช้เวลาถึง 30 วิ) จะทำให้ทั้งเว็บค้าง
    httpd = http.server.ThreadingHTTPServer(("", args.port), Handler)
    httpd.daemon_threads = True
    print(f"[MDA] Serving at http://localhost:{args.port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
