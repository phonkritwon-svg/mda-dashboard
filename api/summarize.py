"""
Vercel serverless function:  POST /api/summarize
แปลข่าวเป็นไทยด้วย Google Translate (ฟรี ไม่ต้อง key)
ถ้าตั้ง env ANTHROPIC_API_KEY ไว้ จะใช้ Claude สรุปให้ละเอียดกว่า
"""

from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
import json
import os
import urllib.request
import urllib.parse

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MAX_ITEMS = 30


# ── Google Translate (free, no key) ─────────────────────────────────────────

def gtranslate(text, target="th"):
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
        return "".join(p[0] for p in data[0] if p and p[0])
    except Exception:
        return text


def _translate_item(it):
    title = it.get("title", "")
    desc  = it.get("description", "")[:280]
    return {
        "index":      it.get("index"),
        "id":         it.get("id"),
        "th_title":   gtranslate(title),
        "th_summary": gtranslate(desc) if desc else "",
    }


def summarize_with_google(items):
    # แปลขนานกันด้วย thread pool ให้ทันใน 10 วินาที
    with ThreadPoolExecutor(max_workers=10) as ex:
        return list(ex.map(_translate_item, items))


# ── Claude API (ถ้ามี key) ───────────────────────────────────────────────────

def summarize_with_claude(items):
    lines = []
    for i, it in enumerate(items):
        lines.append(f'{i+1}. TITLE: {it.get("title","")}\n   DESC: {it.get("description","")[:300]}')

    prompt = (
        "You are a Thai maritime intelligence analyst. "
        "For each item below give:\n"
        "- th_title: concise Thai translation of the title\n"
        "- th_summary: 1-2 sentence Thai summary for a maritime ops dashboard\n\n"
        "Return ONLY a JSON array: [{\"index\":0,\"th_title\":\"\",\"th_summary\":\"\"},...]\n\n"
        + "\n\n".join(lines)
    )

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 2048,
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
    text  = resp["content"][0]["text"].strip()
    start = text.find("[")
    end   = text.rfind("]") + 1
    out   = json.loads(text[start:end]) if start != -1 else []
    # map id back onto results by position
    for i, s in enumerate(out):
        if i < len(items):
            s.setdefault("id", items[i].get("id"))
    return out


# ── Vercel handler ────────────────────────────────────────────────────────────

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
            body = json.loads(self.rfile.read(length) or "{}")
        except Exception:
            body = {}
        items = (body.get("items") or [])[:MAX_ITEMS]

        if not items:
            return self._json({"summaries": []})

        try:
            if API_KEY:
                summaries = summarize_with_claude(items)
            else:
                summaries = summarize_with_google(items)
        except Exception:
            try:
                summaries = summarize_with_google(items)
            except Exception as e:
                return self._json({"error": str(e)}, 500)

        self._json({"summaries": summaries})

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
