"""
ตั้งค่าคีย์ลงไฟล์ .env แบบไม่ต้องแก้ไฟล์เอง

    python setup-key.py            # ตั้งทั้งสองคีย์ (ข้ามได้ด้วยการกด Enter)
    python setup-key.py anthropic  # ตั้งเฉพาะคีย์ Claude
    python setup-key.py ais        # ตั้งเฉพาะคีย์ AISStream

คีย์ที่พิมพ์จะไม่แสดงบนหน้าจอ ไม่ถูกบันทึกลง history ของเทอร์มินัล
และไม่ถูกส่งไปที่ใดนอกจากผู้ให้บริการเจ้าของคีย์ตอนตรวจสอบ
"""

import getpass
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ENV_PATH = Path(__file__).parent / ".env"

FIELDS = {
    "anthropic": {
        "var": "ANTHROPIC_API_KEY",
        "what": "บทวิเคราะห์เชิงลึก + สรุปข่าวด้วย Claude",
        "where": "https://console.anthropic.com/settings/keys",
        "expect": "ขึ้นต้นด้วย sk-ant-",
        "check": lambda k: k.startswith("sk-ant-"),
    },
    "ais": {
        "var": "AISSTREAM_API_KEY",
        "what": "ตำแหน่งเรือจริงบนแผนที่",
        "where": "https://aisstream.io/authenticate",
        "expect": "รหัสยาวประมาณ 40 ตัวอักษร",
        "check": lambda k: len(k) >= 20,
    },
}


def write_value(var, value):
    """เขียนค่าลง .env โดยคงคอมเมนต์และบรรทัดอื่นไว้ทั้งหมด"""
    if not ENV_PATH.exists():
        ENV_PATH.write_text(var + "=" + value + "\n", encoding="utf-8")
        return
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    done = False
    for i, line in enumerate(lines):
        if re.match(r"^\s*" + re.escape(var) + r"\s*=", line):
            lines[i] = var + "=" + value
            done = True
            break
    if not done:
        lines.append(var + "=" + value)
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ask(field_key):
    f = FIELDS[field_key]
    print("\n" + "-" * 60)
    print(f["var"] + "  —  " + f["what"])
    print("  ขอคีย์ได้ที่ : " + f["where"])
    print("  รูปแบบ      : " + f["expect"])
    print("  (กด Enter เฉย ๆ เพื่อข้าม)")

    key = getpass.getpass("  วางคีย์แล้วกด Enter (จะไม่แสดงบนจอ): ").strip()
    if not key:
        print("  ข้ามแล้ว")
        return None

    # ทำความสะอาดค่าที่มักติดมาเวลาคัดลอก
    key = key.strip().strip('"').strip("'").strip()
    if " " in key:
        print("  ✗ คีย์มีช่องว่างปนอยู่ — ลองคัดลอกใหม่ให้ครบบรรทัดเดียว")
        return None
    if not f["check"](key):
        print("  ⚠ รูปแบบดูไม่ตรงกับที่คาด (" + f["expect"] + ")")
        if input("  ยืนยันจะบันทึกค่านี้หรือไม่ (y/N): ").strip().lower() != "y":
            print("  ยกเลิก")
            return None

    write_value(f["var"], key)
    masked = key[:8] + "…" + key[-4:] if len(key) > 14 else "…"
    print("  ✓ บันทึกลง .env แล้ว (" + masked + ")")
    return key


def main():
    which = sys.argv[1].lower() if len(sys.argv) > 1 else "all"
    targets = [which] if which in FIELDS else list(FIELDS)

    print("ตั้งค่าคีย์ลงไฟล์:", ENV_PATH)
    print("ไฟล์นี้ถูก .gitignore ไว้ คีย์จะไม่ถูก commit ขึ้น git")

    saved = 0
    for t in targets:
        if ask(t):
            saved += 1

    print("\n" + "-" * 60)
    if saved:
        print("บันทึกแล้ว %d คีย์ · ขั้นตอนถัดไป:" % saved)
        print("  1) python check-keys.py     ตรวจว่าคีย์ใช้ได้จริง")
        print("  2) python server.py         รันเซิร์ฟเวอร์ใหม่")
    else:
        print("ไม่ได้บันทึกอะไร")
    return 0


if __name__ == "__main__":
    sys.exit(main())
