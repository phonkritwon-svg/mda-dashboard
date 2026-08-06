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

    related = d.get("related") or []
    rel_block = ""
    if related:
        rel_block = "\nOTHER REPORTING ALREADY IN THE SYSTEM (same area or threat domain):\n" + "\n".join(
            "- " + (r.get("title") or "")[:120]
            + ((" [" + r.get("outlet") + "]") if r.get("outlet") else "")
            + ((" (" + r.get("region") + ")") if r.get("region") else "")
            for r in related[:8]
        ) + "\n"

    prompt = (
        "You are a senior Thai maritime intelligence analyst supporting Thailand's "
        "Maritime Enforcement Command Centre (Thai-MECC / ศรชล.). " + lang_line + ".\n"
        "Write a substantive intelligence assessment of the report below, using exactly "
        "these six headings (2-4 sentences each, no bullet padding):\n"
        "1. สถานการณ์ / SITUATION\n"
        "2. การประเมินความน่าเชื่อถือ / CONFIDENCE ASSESSMENT — interpret the Admiralty rating "
        "and state plainly whether the report is usable for decisions or needs corroboration.\n"
        "3. ภัยคุกคามที่เกี่ยวข้อง / THREAT DOMAINS — map to Thai-MECC's 9 domains.\n"
        "4. ผลกระทบต่อไทยและภูมิภาค / IMPACT — be concrete about sea lanes, fisheries, "
        "energy imports or ASEAN posture. If impact on Thailand is minimal, say so directly.\n"
        "5. ข่าวที่เกี่ยวข้องในระบบ / CORRELATED REPORTING — if other reporting is listed below, "
        "say whether this is an isolated event or part of a sustained pattern. If none, say so.\n"
        "6. ข้อเสนอแนะการปฏิบัติ / RECOMMENDED ACTIONS — concrete, addressed to Thai agencies.\n\n"
        "Do not invent facts that are not supported by the material given. If something is "
        "unknown, state that it is unknown.\n\n"
        "REPORT\n"
        "Headline: " + (d.get("title") or "") + "\n"
        "Summary: " + (d.get("summary") or "") + "\n"
        "Source: " + (d.get("outlet") or "") + "\n"
        "Area: " + (d.get("region") or "unspecified") + "\n"
        "Threat domains: " + ", ".join(d.get("threats") or []) + "\n"
        "Admiralty rating: " + (d.get("reliability") or "?") + str(d.get("credibility") or "?") + "\n"
        + rel_block
    )
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1600,
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


REL_SCORE = {"A": 95, "B": 80, "C": 65, "D": 40, "E": 20, "F": 50}
CRED_SCORE = {"1": 95, "2": 80, "3": 60, "4": 35, "5": 15}

# ── ความสำคัญของแต่ละพื้นที่ต่อผลประโยชน์ทางทะเลของไทย ──
REGION_NOTE = {
    "Gulf of Thailand": (
        "อยู่ในน่านน้ำภายใน/EEZ ของไทยโดยตรง กระทบแหล่งประมง แท่นปิโตรเลียม และเส้นทางเข้าออกท่าเรือหลัก",
        "Directly inside Thai internal waters/EEZ — affects fisheries, petroleum platforms and main port approaches."),
    "Andaman Sea": (
        "ชายฝั่งตะวันตกของไทย เส้นทางประมงและท่องเที่ยว ใกล้พื้นที่รับผิดชอบ ทัพเรือภาคที่ 3",
        "Thailand's western seaboard — fishing and tourism routes within RTN Area 3 responsibility."),
    "Strait of Malacca": (
        "คอขวดที่เรือสินค้าและพลังงานนำเข้าของไทยกว่าร้อยละ 80 ต้องผ่าน การหยุดชะงักกระทบทันที",
        "Chokepoint carrying over 80% of Thailand's seaborne trade and energy imports — disruption has immediate effect."),
    "South China Sea": (
        "เส้นทางการค้าหลักและพื้นที่พิพาทหลายฝ่าย กระทบเรือพาณิชย์ไทยและท่าทีอาเซียน",
        "Primary trade route and multi-party disputed area — affects Thai merchant traffic and ASEAN posture."),
    "Cambodia Coast / Gulf of Thailand": (
        "พื้นที่ทับซ้อนไทย-กัมพูชา อ่อนไหวด้านเขตแดนและการประมงข้ามเขต",
        "Thai–Cambodian overlapping claims area — sensitive for boundaries and cross-border fishing."),
    "Myanmar Coast / Andaman–Bay of Bengal": (
        "ชายแดนทะเลไทย-เมียนมา เกี่ยวข้องกับการประมงผิดกฎหมายและการลักลอบเข้าเมือง",
        "Thai–Myanmar maritime frontier — linked to IUU fishing and irregular migration."),
    "Red Sea / Bab el-Mandeb": (
        "เส้นทางไทย-ยุโรป การเลี่ยงเส้นทางทำให้ระยะเวลาขนส่งและเบี้ยประกันภัยสงครามสูงขึ้น",
        "Thailand–Europe lane — rerouting raises transit time and war-risk premiums."),
    "Strait of Hormuz": (
        "ทางออกน้ำมันดิบที่ไทยนำเข้าจากตะวันออกกลาง กระทบราคาพลังงานโดยตรง",
        "Outlet for Middle East crude imported by Thailand — direct effect on energy prices."),
    "Gulf of Aden": (
        "เส้นทางผ่านที่มีประวัติโจรสลัด เรือธงไทยและลูกเรือไทยใช้เส้นทางนี้",
        "Transit route with a piracy history; Thai-flagged ships and Thai crews transit here."),
}

# ── แนวปฏิบัติตามภัยคุกคาม 9 ด้านของ ศรชล. ──
DOMAIN_PLAY = {
    "SAR": ("ประสานศูนย์ SAR และ ทัพเรือภาค แจ้งเรือพาณิชย์ในรัศมีให้ช่วยค้นหา ตรวจสอบพยากรณ์คลื่นลม",
            "Coordinate with the SAR centre and naval area command; broadcast to merchant traffic in radius; check sea state."),
    "IUU": ("ตรวจสอบทะเบียนเรือและ VMS ย้อนหลัง ประสานกรมประมงและ PSM ที่ท่าเรือเข้าเทียบ",
            "Check vessel registry and VMS history; coordinate with Fisheries Dept and port-state measures."),
    "HUMAN": ("ประสานตำรวจน้ำและ ตม. เตรียมขั้นตอนคัดแยกผู้เสียหาย ตามกลไกส่งต่อระดับชาติ",
              "Coordinate Marine Police and Immigration; prepare victim-identification under the national referral mechanism."),
    "DRUG": ("ประสาน ป.ป.ส. และศุลกากร เฝ้าระวังการถ่ายลำกลางทะเล ตรวจสอบเรือที่ AIS ขาดช่วง",
             "Coordinate ONCB and Customs; watch for at-sea transshipment; check vessels with AIS gaps."),
    "ENV": ("แจ้งกรมทรัพยากรทางทะเลฯ ประเมินทิศทางกระแสน้ำ เตรียมแผนขจัดมลพิษหากคราบเคลื่อนเข้าฝั่ง",
            "Notify DMCR; model current drift; ready spill-response if the slick approaches shore."),
    "DISASTER": ("ออกประกาศชาวเรือ ประสานกรมอุตุฯ และเตรียมแผนอพยพเรือประมงเข้าที่กำบัง",
                 "Issue a notice to mariners; coordinate the Met Dept; prepare shelter plans for fishing fleets."),
    "PIRACY": ("แจ้งเตือนเรือธงไทยให้ใช้มาตรการ BMP ยกระดับการเฝ้าระวังและรายงาน UKMTO/ReCAAP",
               "Advise Thai-flagged ships to apply BMP; raise watch levels; report to UKMTO/ReCAAP."),
    "TERROR": ("ยกระดับ ISPS ที่ท่าเรือ ตรวจสอบเรือที่มีประวัติเชื่อมโยง ประสานหน่วยข่าวกรองความมั่นคง",
               "Raise ISPS level at ports; screen vessels with linked history; coordinate security intelligence."),
    "WMD": ("ตรวจสอบรายการสินค้าสองวัตถุประสงค์ ประสานศุลกากรและกลไก PSI ตรวจสอบการเลี่ยงมาตรการคว่ำบาตร",
            "Screen dual-use manifests; coordinate Customs and PSI mechanisms; check for sanctions evasion."),
}


def _confidence(rel, cred):
    return int(round((REL_SCORE.get(rel, 60) + CRED_SCORE.get(cred, 60)) / 2))


def analyze_offline(d, lang):
    th = (lang != "en")
    i = 0 if th else 1
    rel = str(d.get("reliability") or "C").upper()[:1]
    cred = str(d.get("credibility") or "3")[:1]
    relx = REL.get(rel, REL["C"])
    crex = CRED.get(cred, CRED["3"])
    conf = _confidence(rel, cred)

    region = d.get("region") or ("ไม่ระบุพื้นที่" if th else "unspecified area")
    region_key = d.get("regionKey") or d.get("region") or ""
    threats = d.get("threats") or []
    keys = d.get("threatKeys") or []
    related = d.get("related") or []
    title = d.get("title") or ""
    summary = d.get("summary") or ""
    outlet = d.get("outlet") or ("ไม่ระบุแหล่ง" if th else "unknown source")

    out = []

    # 1) สถานการณ์
    out.append(("1. สถานการณ์" if th else "1. SITUATION"))
    out.append((summary or title) or ("ไม่มีเนื้อหาสรุป" if th else "No summary content."))
    out.append(("แหล่งข่าว: " + outlet + " · พื้นที่: " + region) if th
               else ("Source: " + outlet + " · Area: " + region))
    out.append("")

    # 2) ความน่าเชื่อถือ
    out.append(("2. การประเมินความน่าเชื่อถือ" if th else "2. CONFIDENCE ASSESSMENT"))
    if th:
        out.append("เกณฑ์ Admiralty " + rel + cred + " → แหล่งข่าว" + relx[0] + " · เนื้อหา" + crex[0]
                   + " (คะแนนรวมโดยประมาณ " + str(conf) + "/100)")
        out.append("ระดับนี้" + ("เพียงพอต่อการนำไปใช้ประกอบการตัดสินใจได้" if conf >= 75
                   else "ยังต้องยืนยันกับแหล่งข่าวอิสระอย่างน้อยอีก 1 แหล่งก่อนนำไปใช้"))
    else:
        out.append("Admiralty " + rel + cred + " → " + relx[1] + " source · " + crex[1]
                   + " content (composite ≈ " + str(conf) + "/100)")
        out.append("Sufficient for decision support." if conf >= 75
                   else "Requires corroboration from at least one independent source before use.")
    out.append("")

    # 3) ภัยคุกคามที่เกี่ยวข้อง
    out.append(("3. ภัยคุกคามที่เกี่ยวข้อง" if th else "3. THREAT DOMAINS"))
    if threats:
        out.append(("เข้าข่าย " + str(len(threats)) + " ด้าน: " if th
                    else "Matches " + str(len(threats)) + " domain(s): ") + ", ".join(threats))
    else:
        out.append("ไม่เข้าข่ายภัยคุกคาม 9 ด้านของ ศรชล. โดยตรง — จัดเป็นข่าวบริบท/อุตสาหกรรม" if th
                   else "No direct match to the 9 Thai-MECC threat domains — treat as context/industry reporting.")
    out.append("")

    # 4) ผลกระทบต่อไทย
    out.append(("4. ผลกระทบต่อไทยและภูมิภาค" if th else "4. IMPACT ON THAILAND & REGION"))
    note = REGION_NOTE.get(region_key)
    if note:
        out.append(note[i])
    else:
        out.append(("อยู่นอกพื้นที่ปฏิบัติการหลักของไทย ผลกระทบทางตรงจำกัด "
                    "แต่ควรติดตามผลต่อเส้นทางเดินเรือและห่วงโซ่อุปทานที่เชื่อมถึงไทย") if th
                   else ("Outside Thailand's primary operating area — limited direct impact, "
                         "but monitor effects on sea lanes and supply chains linked to Thailand."))
    out.append("")

    # 5) ข่าวที่เกี่ยวข้อง (correlation)
    out.append(("5. ข่าวที่เกี่ยวข้องในระบบ" if th else "5. CORRELATED REPORTING"))
    if related:
        out.append(("พบข่าวเชื่อมโยง " + str(len(related)) + " ชิ้น:") if th
                   else ("Found " + str(len(related)) + " linked item(s):"))
        for r in related[:5]:
            rt = (r.get("title") or "").strip()
            ro = r.get("outlet") or ""
            rr = r.get("region") or ""
            out.append("  • " + rt[:110] + ((" — " + ro) if ro else "") + ((" · " + rr) if rr else ""))
        if len(related) >= 3:
            out.append(("รูปแบบข่าวซ้ำในพื้นที่เดียวกันบ่งชี้ว่าเป็นแนวโน้มต่อเนื่อง ไม่ใช่เหตุการณ์เดี่ยว") if th
                       else "Repeated reporting in the same area indicates a sustained trend, not an isolated event.")
    else:
        out.append("ไม่พบข่าวอื่นในพื้นที่หรือด้านภัยคุกคามเดียวกัน — ยังเป็นรายงานเดี่ยว" if th
                   else "No other reporting in the same area or domain — currently a single-source event.")
    out.append("")

    # 6) ข้อเสนอแนะการปฏิบัติ
    out.append(("6. ข้อเสนอแนะการปฏิบัติ" if th else "6. RECOMMENDED ACTIONS"))
    acted = False
    for k in keys:
        play = DOMAIN_PLAY.get(k)
        if play:
            out.append("  • " + play[i])
            acted = True
    if not acted:
        out.append(("  • เฝ้าติดตามตามรอบปกติ และจัดเก็บเข้าคลังข่าวเพื่อใช้เทียบแนวโน้ม") if th
                   else "  • Routine monitoring; archive for trend comparison.")
    if conf < 75:
        out.append(("  • ยืนยันข้อมูลกับแหล่งข่าวอิสระก่อนยกระดับการปฏิบัติ") if th
                   else "  • Corroborate with an independent source before escalating.")
    out.append(("  • ตรวจสอบภาพ AIS/ดาวเทียมในพื้นที่ " + region) if th
               else ("  • Cross-check AIS/satellite imagery over " + region))
    out.append("")

    out.append("— " + (
        "บทประเมินอัตโนมัติจากข้อมูลในระบบ (ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY จึงไม่ได้ใช้ LLM)" if th
        else "Rule-based assessment from in-system data (ANTHROPIC_API_KEY not configured, so no LLM was used)."))
    return "\n".join(out)


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
