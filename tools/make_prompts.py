"""Writes prompts/<step>.txt from docs/05_BUILD_PLAN.md: each step's prompt with the closing block filled in,
ready to paste into a coding agent or hand to a teammate.

    python tools/make_prompts.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
plan = (ROOT / "docs/05_BUILD_PLAN.md").read_text(encoding="utf-8")
closing = re.search(r"## 8\. The closing block.*?```text\n(.*?)```", plan, flags=re.S).group(1).rstrip()
out = ROOT / "prompts"
out.mkdir(exist_ok=True)
for old in out.glob("*.txt"):
    old.unlink()
n = 0
for m in re.finditer(r"\*\*Prompt ([0-9A-Z]+)[^*]*\*\*\n```text\n(.*?)```", plan, flags=re.S):
    step, body = m.group(1), m.group(2).rstrip()
    assert "[CLOSING]" in body, step
    (out / f"part-{step}.txt").write_text(body.replace("[CLOSING]", closing) + "\n", encoding="utf-8")
    n += 1
print(n, "prompts written to", out)
