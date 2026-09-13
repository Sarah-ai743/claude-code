#!/usr/bin/env python3
"""Render Short production packages from authored source files.

One source object per Short is the single point of truth. This renders the five
delivery files into shorts/<id>/. Re-run it any time a source changes.

    python3 shorts/_system/build.py                 # build everything
    python3 shorts/_system/build.py 001 004         # build selected IDs

Style and character locks are appended to every image prompt automatically, so
character consistency is enforced by the build rather than by memory.
"""
import json, sys, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "shorts" / "_system" / "sources"
OUT = ROOT / "shorts"

WPS = 3.0  # fast Shorts narration, words per second


def words(text):
    return len(re.findall(r"[A-Za-z0-9'\-]+", text))


def vo_text(s):
    return " ".join(s["voiceover"])


def compose_prompt(scene, s):
    bits = [scene["prompt"].rstrip(". ")]
    if scene.get("character"):
        bits.append(s["character_lock"])
    bits.append(s["style_lock"])
    bits.append("vertical 9:16 composition, single clear focal subject")
    return ". ".join(bits) + "."


def render_script(s):
    vo = vo_text(s)
    L = []
    A = L.append
    A(f"{s['id']} - {s['working_title']}")
    A("=" * 60)
    A(f"Concept:       {s['concept_id']}  ({s['anomaly_class']}/{s['twist_architecture']})")
    A(f"Target length: {s['target_seconds']}s")
    A(f"Voiceover:     {words(vo)} words (~{words(vo)/WPS:.0f}s at {WPS:.1f} w/s)")
    A(f"Scenes:        {len(s['scenes'])}")
    A("")
    A("ORIGINAL FICTION. Not a real event, person, company or recording.")
    A("")
    A("-" * 60)
    A("1. ALTERNATIVE OPENING HOOKS")
    A("-" * 60)
    for i, h in enumerate(s["hooks"]):
        mark = "  <-- SELECTED" if i == s["selected_hook"] else ""
        A(f"  [{i+1}] \"{h['text']}\"  ({words(h['text'])} words){mark}")
        A(f"      {h['note']}")
    A("")
    A("2. HOOK SELECTION")
    A(f"  {s['hook_rationale']}")
    A("")
    A("-" * 60)
    A("3. VOICEOVER")
    A("-" * 60)
    for line in s["voiceover"]:
        A(f"  {line}")
    A("")
    A("-" * 60)
    A("4/5/6. SCENES, CAPTIONS, VISUALS")
    A("-" * 60)
    for sc in s["scenes"]:
        A(f"  SCENE {sc['n']:>2}  [{sc['start']:>4.1f}s - {sc['end']:>4.1f}s]")
        A(f"    CAPTION : {sc['caption']}")
        A(f"    VISUAL  : {sc['visual']}")
        A(f"    SFX     : {sc['sfx']}")
        A("")
    A("-" * 60)
    A("8/9. SOUND AND MUSIC")
    A("-" * 60)
    A(f"  Music mood: {s['music_mood']}")
    A(f"  Sound bed : {s['sound_bed']}")
    A("")
    A("-" * 60)
    A("10. FINAL TWIST")
    A("-" * 60)
    A(f"  {s['final_twist']}")
    A("")
    A("-" * 60)
    A("11/12/13/14. PUBLISHING")
    A("-" * 60)
    A(f"  Title      : {s['youtube_title']}")
    A(f"  Description: {s['description']}")
    A(f"  Hashtags   : {' '.join(s['hashtags'])}")
    A(f"  Pinned     : {s['pinned_comment']}")
    A("")
    return "\n".join(L) + "\n"


def render_voiceover(s):
    head = [
        f"# {s['id']} - {s['working_title']} - VOICEOVER",
        f"# {words(vo_text(s))} words | target {s['target_seconds']}s | read fast, flat, unhurried",
        "# Half a second of silence before the twist line, marked [BEAT].",
        "",
    ]
    return "\n".join(head + s["voiceover"]) + "\n"


def render_scenes(s):
    return json.dumps({
        "id": s["id"],
        "concept_id": s["concept_id"],
        "working_title": s["working_title"],
        "target_seconds": s["target_seconds"],
        "aspect_ratio": "9:16",
        "character_lock": s["character_lock"],
        "style_lock": s["style_lock"],
        "scene_count": len(s["scenes"]),
        "scenes": [{
            "n": sc["n"],
            "start": sc["start"],
            "end": sc["end"],
            "duration": round(sc["end"] - sc["start"], 1),
            "caption": sc["caption"],
            "visual": sc["visual"],
            "prompt": compose_prompt(sc, s),
            "sfx": sc["sfx"],
            "shot_change": sc.get("shot_change", "cut"),
        } for sc in s["scenes"]],
    }, indent=2, ensure_ascii=False) + "\n"


def render_metadata(s):
    vo = vo_text(s)
    return json.dumps({
        "id": s["id"],
        "concept_id": s["concept_id"],
        "working_title": s["working_title"],
        "anomaly_class": s["anomaly_class"],
        "twist_architecture": s["twist_architecture"],
        "fiction_notice": "Original fiction. Not a real event, person, company or recording.",
        "target_seconds": s["target_seconds"],
        "voiceover_words": words(vo),
        "estimated_seconds": round(words(vo) / WPS, 1),
        "hooks": [{"text": h["text"], "words": words(h["text"]), "note": h["note"],
                   "selected": i == s["selected_hook"]} for i, h in enumerate(s["hooks"])],
        "hook_rationale": s["hook_rationale"],
        "final_twist": s["final_twist"],
        "music_mood": s["music_mood"],
        "sound_bed": s["sound_bed"],
        "youtube_title": s["youtube_title"],
        "description": s["description"],
        "hashtags": s["hashtags"],
        "pinned_comment": s["pinned_comment"],
        "on_screen_fiction_tag": "FICTION tag, bottom corner, from 0:02 to end",
        "synthetic_media_disclosure": "Tick YouTube altered/synthetic content disclosure if realistic AI footage is used.",
    }, indent=2, ensure_ascii=False) + "\n"


def render_prompts(s):
    L = [f"# {s['id']} - {s['working_title']} - IMAGE / VIDEO PROMPTS",
         f"# {len(s['scenes'])} scenes | 9:16 vertical",
         f"# CHARACTER LOCK: {s['character_lock']}",
         f"# STYLE LOCK: {s['style_lock']}",
         ""]
    for sc in s["scenes"]:
        L.append(f"[{sc['n']:02d}] {compose_prompt(sc, s)}")
        L.append("")
    return "\n".join(L)


def build(s):
    d = OUT / s["id"]
    d.mkdir(parents=True, exist_ok=True)
    (d / "script.txt").write_text(render_script(s))
    (d / "voiceover.txt").write_text(render_voiceover(s))
    (d / "scenes.json").write_text(render_scenes(s))
    (d / "metadata.json").write_text(render_metadata(s))
    (d / "visual_prompts.txt").write_text(render_prompts(s))
    return d, words(vo_text(s)), len(s["scenes"])


def main():
    wanted = set(sys.argv[1:])
    sources = []
    for f in sorted(SRC.glob("*.json")):
        data = json.loads(f.read_text())
        sources.extend(data if isinstance(data, list) else [data])
    built = 0
    for s in sources:
        if wanted and s["id"] not in wanted:
            continue
        d, w, n = build(s)
        print(f"built {d.relative_to(ROOT)}  {w} words, {n} scenes")
        built += 1
    print(f"\n{built} package(s) built.")


if __name__ == "__main__":
    main()
