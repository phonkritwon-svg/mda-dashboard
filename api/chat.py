"""
Vercel serverless:  POST /api/chat
ผู้ช่วยถาม-ตอบเกี่ยวกับ "ข่าวทั้งหมด" ในระบบ MDA

  • ถ้าตั้ง env ANTHROPIC_API_KEY → ใช้ Claude ตอบโดยอ้างอิงข่าวที่ค้นเจอ
  • ถ้าไม่มี key → โหมด offline: ค้นข่าวด้วยคำสำคัญแล้วสรุปให้ (ไม่แต่งเรื่องเพิ่ม)

Request JSON:
  { question, history: [{role, content}], news: [{id,title,summary,outlet,region,time,url}], lang }
Response JSON:
  { ok, engine: "claude"|"offline", text, sources: [{id,title,outlet,region,url}] }
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re
import urllib.request

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

MAX_CONTEXT_ITEMS = 40      # จำนวนข่าวสูงสุดที่ส่งให้ LLM ต่อคำถาม
MAX_HISTORY = 8             # จำนวนข้อความย้อนหลังที่ถือเป็นบริบทบทสนทนา

# คำที่ไม่ช่วยในการค้นหา (ตัดทิ้งก่อนจับคู่คำสำคัญ)
STOPWORDS = set("""
the a an of in on at to for and or is are was were be been by with from as that this these those
it its his her their our your my we you they he she i what which who whom how why when where
มี ของ ใน ที่ และ หรือ เป็น คือ จะ ได้ ให้ กับ จาก ถึง โดย ว่า ไหม บ้าง อะไร ที่ไหน เมื่อไหร่ อย่างไร ทำไม
ช่วย ขอ หน่อย ครับ ค่ะ คะ แล้ว ยัง ไหน กี่ ใคร ไทย
""".split())


# วลีคำถามภาษาไทยที่ไม่บอกเนื้อหา — ต้องตัดทิ้ง "ก่อน" ทำ n-gram
# มิฉะนั้นชิ้นส่วนอย่าง "ข่าวเก" จะไปแมตช์ข่าวทุกชิ้นที่มีคำว่า "ข่าว"
THAI_FILLER = re.compile(
    r"มีข่าว|ข่าวอะไร|เกี่ยวกับ|เกี่ยวข้อง|ข่าวไหน|ข่าวที่|บ้างไหม|มีอะไร|"
    r"ช่วยสรุป|ช่วยบอก|อยากทราบ|อยากรู้|ขอทราบ|ตอนนี้|ล่าสุด|ทั้งหมด|"
    r"หน่อยครับ|หน่อยค่ะ|ครับ|ค่ะ|คะ|บ้าง|ไหม|หรือไม่|อะไร|ยังไง|อย่างไร|ทำไม|"
    r"ที่ไหน|เมื่อไหร่|เท่าไหร่|กี่|ใคร|ข่าว"
)


def _tokens(text):
    """ตัดคำหยาบ ๆ: อังกฤษใช้ขอบเขตคำ, ไทยใช้ n-gram เพราะไม่มีตัวตัดคำ"""
    text = (text or "").lower()
    toks = set()
    for w in re.findall(r"[a-z0-9]{3,}", text):
        if w not in STOPWORDS:
            toks.add(w)
    cleaned = THAI_FILLER.sub(" ", text)          # เอาวลีคำถามออกก่อน
    for chunk in re.findall(r"[฀-๿]+", cleaned):
        if len(chunk) < 4:
            continue
        for n in (4, 5, 6):
            for i in range(len(chunk) - n + 1):
                g = chunk[i:i + n]
                if g not in STOPWORDS:
                    toks.add(g)
    return toks


RELEVANCE_FLOOR = 0.40      # ต้องได้อย่างน้อย 40% ของคะแนนสูงสุด จึงนับว่าเกี่ยวข้อง
MIN_SCORE = 12              # เกณฑ์สัมบูรณ์: ถ้าคะแนนสูงสุดยังไม่ถึงนี้ = ไม่มีข่าวตรงจริง


def rank_news(question, news):
    """จัดอันดับข่าวตามความเกี่ยวข้องกับคำถาม

    หมายเหตุ: ภาษาไทยไม่มีตัวตัดคำ จึงใช้ n-gram ซึ่งทำให้ชิ้นส่วนกว้าง ๆ
    (เช่น 'ทะเล' ที่อยู่ใน 'ทะเลแดง') ไปแมตช์ 'ทะเลจีนใต้' หรือ 'ทะเลบอลติก' ด้วย
    จึงต้องตัดข่าวที่คะแนนต่ำกว่าเกณฑ์เทียบกับข่าวที่ตรงที่สุดออก"""
    q = _tokens(question)
    if not q:
        return list(news)[:MAX_CONTEXT_ITEMS]

    scored = []
    for n in news:
        title = str(n.get("title") or "").lower()
        region = str(n.get("region") or "").lower()
        hay = " ".join(str(n.get(k) or "") for k in ("title", "summary", "outlet", "region")).lower()
        score = 0
        for t in q:
            if t not in hay:
                continue
            # ยิ่งคำยาวยิ่งเจาะจง · อยู่ในหัวข้อหรือชื่อพื้นที่ = สำคัญกว่าอยู่ในเนื้อสรุป
            w = 1
            if t in title:
                w = 3
            elif t in region:
                w = 2
            score += len(t) * w
        if score:
            scored.append((score, n))

    if not scored:
        return []

    scored.sort(key=lambda x: -x[0])
    top = scored[0][0]
    if top < MIN_SCORE:
        return []                       # แมตช์ที่ดีที่สุดยังอ่อนเกินไป → ถือว่าไม่มีข่าวตรง
    cut = max(top * RELEVANCE_FLOOR, MIN_SCORE)
    keep = [n for s, n in scored if s >= cut]
    return keep[:MAX_CONTEXT_ITEMS]


def _fmt_item(i, n):
    bits = ["[%d] %s" % (i + 1, (n.get("title") or "").strip())]
    if n.get("summary"):
        bits.append("    " + str(n["summary"])[:280])
    meta = " · ".join(x for x in [n.get("outlet"), n.get("region"), n.get("time")] if x)
    if meta:
        bits.append("    (" + meta + ")")
    return "\n".join(bits)


def chat_with_claude(question, history, items, lang):
    th = (lang != "en")
    lang_line = "ตอบเป็นภาษาไทย" if th else "Answer in English"

    corpus = "\n\n".join(_fmt_item(i, n) for i, n in enumerate(items)) or (
        "(ไม่มีข่าวที่เกี่ยวข้อง)" if th else "(no relevant reporting)")

    system = (
        "You are the analyst assistant of Thailand's Maritime Enforcement Command Centre "
        "(Thai-MECC / ศรชล.) inside an OSINT dashboard. " + lang_line + ".\n"
        "Answer ONLY from the numbered reporting given below. Rules:\n"
        "- Cite the items you used as [1], [2] … inline, right after the claim they support.\n"
        "- If the reporting does not contain the answer, say so plainly and state what is missing. "
        "Never invent vessels, dates, casualties or figures that are not in the material.\n"
        "- Be concise: 2-5 sentences, or a short bullet list when comparing several items.\n"
        "- When the question asks for a count or a list, answer with the actual items you can see.\n"
    )

    msgs = []
    for h in (history or [])[-MAX_HISTORY:]:
        role = "assistant" if h.get("role") == "assistant" else "user"
        content = str(h.get("content") or "").strip()
        if content:
            msgs.append({"role": role, "content": content[:2000]})
    msgs.append({"role": "user", "content":
                 "REPORTING AVAILABLE:\n" + corpus + "\n\nQUESTION: " + question})

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1200,
        "system": system,
        "messages": msgs,
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
    with urllib.request.urlopen(req, timeout=45) as r:
        resp = json.loads(r.read())
    return resp["content"][0]["text"].strip()


def chat_offline(question, items, lang, total):
    """ไม่มี LLM → ทำหน้าที่เป็น 'เครื่องค้นข่าว' ที่ซื่อสัตย์
    สรุปเฉพาะสิ่งที่มีจริงในข่าว ไม่เดาเนื้อหาเพิ่ม"""
    th = (lang != "en")
    if not items:
        return (
            "ไม่พบข่าวในระบบที่ตรงกับคำถามนี้ (ค้นจากข่าวทั้งหมด %d ชิ้น)\n"
            "ลองใช้คำค้นอื่น เช่น ชื่อพื้นที่ (ทะเลแดง, อ่าวไทย), ชื่อเรือ, "
            "หรือประเภทภัย (โจรสลัด, ประมงผิดกฎหมาย)" % total
        ) if th else (
            "No reporting in the system matches this question (searched %d items).\n"
            "Try another term — an area (Red Sea, Gulf of Thailand), a vessel name, "
            "or a threat type (piracy, IUU fishing)." % total
        )

    by_region = {}
    for n in items:
        by_region.setdefault(n.get("region") or ("ไม่ระบุพื้นที่" if th else "unspecified"), []).append(n)

    out = []
    if th:
        out.append("พบข่าวที่เกี่ยวข้อง %d ชิ้น จากทั้งหมด %d ชิ้นในระบบ" % (len(items), total))
        out.append("แบ่งตามพื้นที่: " + ", ".join(
            "%s (%d)" % (k, len(v)) for k, v in sorted(by_region.items(), key=lambda x: -len(x[1]))))
        out.append("")
        out.append("ข่าวที่เกี่ยวข้องมากที่สุด:")
    else:
        out.append("Found %d relevant item(s) out of %d in the system." % (len(items), total))
        out.append("By area: " + ", ".join(
            "%s (%d)" % (k, len(v)) for k, v in sorted(by_region.items(), key=lambda x: -len(x[1]))))
        out.append("")
        out.append("Most relevant reporting:")

    for i, n in enumerate(items[:6]):
        out.append("[%d] %s" % (i + 1, (n.get("title") or "").strip()))
        meta = " · ".join(x for x in [n.get("outlet"), n.get("region"), n.get("time")] if x)
        if meta:
            out.append("     " + meta)
        if n.get("summary"):
            out.append("     " + str(n["summary"])[:200])

    out.append("")
    out.append("— " + (
        "โหมดค้นหา (ยังไม่ได้ตั้ง ANTHROPIC_API_KEY) จึงแสดงข่าวที่ตรงคำค้นแทนการสรุปด้วย AI"
        if th else
        "Search mode (ANTHROPIC_API_KEY not set) — showing matching reporting instead of an AI summary."))
    return "\n".join(out)


def handle_chat(d):
    question = str(d.get("question") or "").strip()
    lang = d.get("lang", "th")
    news = d.get("news") or []
    history = d.get("history") or []

    if not question:
        return {"ok": False, "engine": "none",
                "text": "กรุณาพิมพ์คำถาม" if lang != "en" else "Please enter a question."}

    items = rank_news(question, news)
    sources = [{"id": n.get("id"), "title": n.get("title"), "outlet": n.get("outlet"),
                "region": n.get("region"), "url": n.get("url")} for n in items[:10]]

    if API_KEY:
        try:
            return {"ok": True, "engine": "claude",
                    "text": chat_with_claude(question, history, items, lang),
                    "sources": sources}
        except Exception as e:
            print("[MDA] chat: Claude failed -> offline:", e)

    return {"ok": True, "engine": "offline",
            "text": chat_offline(question, items, lang, len(news)),
            "sources": sources}


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
        self._json(handle_chat(d))

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
