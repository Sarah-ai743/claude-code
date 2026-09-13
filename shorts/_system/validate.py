#!/usr/bin/env python3
"""Gate every built Short package against the format rules. Exits non-zero on failure."""
import json, sys, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "shorts"
FILES = ["script.txt", "voiceover.txt", "scenes.json", "metadata.json", "visual_prompts.txt"]
BANNED = ["did you know", "once upon a time", "this is the story of",
          "you won't believe", "welcome back", "imagine", "what if i told you"]


def words(t):
    return len(re.findall(r"[A-Za-z0-9'\-]+", t))


def check(d):
    errs, warns = [], []
    for f in FILES:
        if not (d / f).exists():
            errs.append(f"missing {f}")
    if errs:
        return errs, warns

    meta = json.loads((d / "metadata.json").read_text())
    scenes = json.loads((d / "scenes.json").read_text())
    vo_lines = [l for l in (d / "voiceover.txt").read_text().splitlines()
                if l.strip() and not l.startswith("#")]
    vo = " ".join(vo_lines).replace("[BEAT]", " ")

    w = words(vo)
    if not 100 <= w <= 140:
        errs.append(f"voiceover {w} words, must be 100-140")

    secs = w / 3.0
    if not 35 <= secs <= 55:
        errs.append(f"estimated runtime {secs:.0f}s, must be 35-55s")

    first = vo_lines[0].lower().strip()
    for b in BANNED:
        if first.startswith(b):
            errs.append(f"banned opener: '{b}'")

    for sent in re.split(r"(?<=[.!?])\s+", vo):
        if words(sent) > 18:
            errs.append(f"sentence over 18 words: '{sent[:48]}...'")
    sents = [s for s in re.split(r"(?<=[.!?])\s+", vo) if s.strip()]
    avg = w / max(len(sents), 1)
    if avg > 11:
        warns.append(f"average sentence {avg:.1f} words, target <= 11")

    n = len(scenes["scenes"])
    if not 8 <= n <= 12:
        errs.append(f"{n} scenes, must be 8-12")

    prev_end = 0.0
    for sc in scenes["scenes"]:
        cw = words(sc["caption"])
        if cw > 6:
            errs.append(f"scene {sc['n']} caption {cw} words, max 6")
        if not re.search(r"[A-Z]{2,}", sc["caption"]):
            warns.append(f"scene {sc['n']} caption has no emphasised word")
        if sc["duration"] > 8:
            errs.append(f"scene {sc['n']} runs {sc['duration']}s, max 8s between changes")
        if abs(sc["start"] - prev_end) > 0.01:
            errs.append(f"scene {sc['n']} starts at {sc['start']}, previous ended {prev_end}")
        prev_end = sc["end"]
        if not sc["prompt"].rstrip().endswith("."):
            warns.append(f"scene {sc['n']} prompt not terminated")
        if "9:16" not in sc["prompt"]:
            errs.append(f"scene {sc['n']} prompt missing aspect ratio")

    total = scenes["scenes"][-1]["end"]
    if not 35 <= total <= 55:
        errs.append(f"scene timeline ends at {total}s, must be 35-55s")

    hooks = meta["hooks"]
    if len(hooks) != 3:
        errs.append(f"{len(hooks)} hooks, must be 3")
    if sum(1 for h in hooks if h["selected"]) != 1:
        errs.append("exactly one hook must be selected")
    sel = next(h for h in hooks if h["selected"])
    if sel["words"] > 12:
        warns.append(f"selected hook {sel['words']} words, prefer <= 12")
    if not vo_lines[0].strip().startswith(sel["text"][:20]):
        errs.append("voiceover does not open with the selected hook")

    if len(meta["hashtags"]) != 3:
        errs.append(f"{len(meta['hashtags'])} hashtags, must be 3")
    if not meta["description"].lower().startswith("original fiction"):
        errs.append("description must open with the fiction disclosure")
    if "fiction" not in meta["pinned_comment"].lower():
        errs.append("pinned comment must carry the fiction disclosure")
    if len(meta["youtube_title"]) > 70:
        warns.append(f"title {len(meta['youtube_title'])} chars, prefer <= 70")

    return errs, warns


def main():
    dirs = sorted(p for p in OUT.iterdir() if p.is_dir() and p.name.isdigit())
    if not dirs:
        print("no built packages found")
        return 1
    failed = 0
    for d in dirs:
        errs, warns = check(d)
        status = "PASS" if not errs else "FAIL"
        print(f"[{status}] {d.name}")
        for w in warns:
            print(f"        warn: {w}")
        for e in errs:
            print(f"        ERROR: {e}")
        failed += bool(errs)
    print(f"\n{len(dirs)} packages, {failed} failing.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
