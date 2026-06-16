"""
MDA Dev Server
  - Serves static files on port 7432
  - POST /api/summarize  → แปลข่าวเป็นไทยด้วย Google Translate (ไม่ต้อง key)
                           ถ้ามี ANTHROPIC_API_KEY จะใช้ Claude สรุปให้ละเอียดกว่า
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
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


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

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/summarize":
            self._handle_summarize()
        else:
            self.send_error(404)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
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

    mode = f"Claude Haiku ({API_KEY[:12]}...)" if API_KEY else "Google Translate (free)"
    print(f"[MDA] AI summaries: {mode}")

    os.chdir(Path(__file__).parent)
    httpd = http.server.HTTPServer(("", args.port), Handler)
    print(f"[MDA] Serving at http://localhost:{args.port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
