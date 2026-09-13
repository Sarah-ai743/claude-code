#!/usr/bin/env python3
"""Quality control for Shorts scripts.

Every script is scored 0-100 across six weighted dimensions. A script is approved
only if it scores 85 or above AND trips none of the ten rejection triggers.

Each dimension splits into an AUTOMATED portion (measurable from the built package)
and a REVIEW portion (judgment, supplied in shorts/_system/reviews/<id>.json and
recorded verbatim). A script with no review on file cannot be approved - the engine
reports it as UNREVIEWED rather than guessing.

    python3 shorts/_system/qc.py            # score everything, write the ledger
    python3 shorts/_system/qc.py 003        # score one package
    python3 shorts/_system/qc.py --no-write # score without touching the ledger

Automated checks are PROXIES for editorial qualities, not replacements for reading
the script. They are tuned to catch the failure rather than to certify the success:
passing every automated check means nothing obvious is wrong, not that the script is good.
"""
import json, re, sys, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "shorts"
REVIEWS = ROOT / "shorts" / "_system" / "reviews"
HISTORY = ROOT / "shorts" / "_system" / "qc_history.json"
LEDGER = ROOT / "quality_control.md"
CONCEPTS = ROOT / "content" / "100_short_concepts.json"

PASS_MARK = 85
MAX_REWRITES = 3

WEIGHTS = {"hook": 25, "retention": 20, "originality": 20,
           "twist": 15, "visual": 10, "clarity": 10}
AUTO_MAX = {"hook": 10, "retention": 12, "originality": 12,
            "twist": 6, "visual": 5, "clarity": 6}
REVIEW_MAX = {k: WEIGHTS[k] - AUTO_MAX[k] for k in WEIGHTS}

BANNED_OPENERS = ["did you know", "once upon a time", "this is the story of",
                  "you won't believe", "welcome back", "imagine",
                  "what if i told you", "in this video"]

# Names that would make a script depend on material we do not own. Extended as needed.
PROTECTED = [
    "youtube", "google", "iphone", "android", "samsung", "microsoft", "facebook",
    "instagram", "tiktok", "whatsapp", "alexa", "siri", "netflix", "spotify", "reddit",
    "discord", "twitter", "snapchat", "ebay", "chatgpt", "openai", "tesla", "playstation",
    "xbox", "nintendo", "marvel", "disney", "star wars", "harry potter", "slender man",
    "backrooms", "black mirror",
]

# Brand names that are also ordinary English words. A lowercase "ring" or "windows" is
# jewellery and glazing; only a capitalised one mid-sentence is a product reference.
PROTECTED_AMBIGUOUS = ["Ring", "Windows", "Nest", "Apple", "Amazon", "Echo", "Alexa"]

# Phrasing that would present invented events as documented fact.
FABRICATION = [
    r"\breal footage\b", r"\bactually happened\b", r"\btrue story\b", r"\bbased on a true\b",
    r"\bleaked\b", r"\bdocumented case\b", r"\breal recording\b", r"\bnever been explained\b",
    r"\bauthorities\b", r"\bpolice report\b", r"\bcase file\b", r"\bdeclassified\b",
    r"\bthis really\b", r"\bconfirmed by\b",
]

EXPOSITION = ["because", "which means", "the reason", "in order to", "due to",
              "this is why", "it turns out", "therefore", "essentially", "basically",
              "apparently", "obviously", "in other words", "the explanation"]

SUMMARY_ENDING = ["so that", "which means", "in the end", "and that is why",
                  "that is how", "meaning that"]

STOP = set("""a an the and or but if then than that this these those of to in on at by for
with from as is are was were be been being it its it's he she they them his her their you
your we our i not no never only just still there here what who how when all one two into
out up down over under again more most very can could would should has have had do does
did about after before back same own now""".split())


def toks(t):
    return re.findall(r"[a-z0-9']+", t.lower())


def content(t):
    return {w for w in toks(t) if w not in STOP and len(w) > 2}


def words(t):
    return len(re.findall(r"[A-Za-z0-9'\-]+", t))


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def sentences(t):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", t) if s.strip()]


def load_package(d):
    return (json.loads((d / "metadata.json").read_text()),
            json.loads((d / "scenes.json").read_text()),
            [l for l in (d / "voiceover.txt").read_text().splitlines()
             if l.strip() and not l.startswith("#")])


class Result:
    def __init__(self, pid):
        self.id = pid
        self.auto = {k: 0 for k in WEIGHTS}
        self.checks = []          # (dimension, points, max, passed, description)
        self.triggers = {}        # trigger -> reason (fires a rejection)
        self.suspected = {}       # trigger -> reason (reviewer must confirm or override)
        self.overrides = {}       # trigger -> reviewer's written override
        self.review = None

    def add(self, dim, pts, mx, ok, desc):
        self.auto[dim] += pts if ok else 0
        self.checks.append((dim, pts if ok else 0, mx, ok, desc))

    def fire(self, name, reason):
        self.triggers[name] = reason

    def suspect(self, name, reason):
        self.suspected[name] = reason


def score_package(pid, all_packages, concepts):
    d = OUT / pid
    meta, scenes, vo_lines = load_package(d)
    r = Result(pid)

    vo = " ".join(vo_lines).replace("[BEAT]", " ").strip()
    vo_words = words(vo)
    sents = sentences(vo)
    hook = next(h for h in meta["hooks"] if h["selected"])["text"]
    scs = scenes["scenes"]
    runtime = scs[-1]["end"]

    # ---------------- HOOK (auto 10) ----------------
    hw = words(hook)
    r.add("hook", 3, 3, hw <= 9, f"hook is {hw} words (needs <= 9)")
    lower = hook.lower()
    banned = [b for b in BANNED_OPENERS if lower.startswith(b)]
    r.add("hook", 2, 2, not banned, f"no banned opener{' - found ' + banned[0] if banned else ''}")
    NUMBERS = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
               "ten", "eleven", "twelve", "thirty", "forty", "hundred", "thousand"}
    OBJECTS = {"photo", "photograph", "video", "camera", "phone", "screen", "room", "map",
               "file", "tape", "door", "computer", "lamp", "listing", "footage", "account",
               "message", "chat", "house", "car", "street", "folder", "recording", "monitor"}
    t = set(toks(hook))
    concrete = (bool(re.search(r"\d", hook)) or bool(NUMBERS & t)
                or bool({"no", "never", "nobody", "none", "nothing"} & t)
                or bool(OBJECTS & t))
    r.add("hook", 3, 3, concrete,
          "hook names a thing, a number or an absence (a concrete anomaly signal)")
    r.add("hook", 2, 2, vo_lines[0].strip().startswith(hook[:20]),
          "voiceover opens on the selected hook")
    if hw > 12 or banned:
        r.fire("hook_weak", f"automated: {hw} words" + (f", banned opener '{banned[0]}'" if banned else ""))

    # ---------------- RETENTION (auto 12) ----------------
    gaps, last_change, prev_terms = [], 0.0, set()
    for sc in scs:
        new_terms = content(sc["caption"]) - prev_terms
        if new_terms:
            gaps.append(sc["start"] - last_change)
            last_change = sc["start"]
        prev_terms |= content(sc["caption"])
    gaps.append(runtime - last_change)
    worst = max(gaps) if gaps else runtime
    r.add("retention", 3, 3, worst <= 8,
          f"longest stretch with no new on-screen information: {worst:.1f}s (max 8s)")
    if worst > 8:
        r.fire("dead_air", f"{worst:.1f}s with nothing meaningful introduced")

    longest_scene = max(sc["duration"] for sc in scs)
    contiguous = all(abs(scs[i]["start"] - scs[i - 1]["end"]) < 0.01 for i in range(1, len(scs)))
    r.add("retention", 3, 3, longest_scene <= 8 and contiguous,
          f"longest scene {longest_scene}s, timeline contiguous: {contiguous}")
    r.add("retention", 2, 2, 100 <= vo_words <= 140, f"voiceover {vo_words} words (100-140)")
    r.add("retention", 2, 2, 35 <= runtime <= 55, f"runtime {runtime}s (35-55)")
    half = len(vo_lines) // 2
    early = set().union(*[content(l) for l in vo_lines[:half]]) if half else set()
    late_new = [l for l in vo_lines[half:] if len(content(l) - early) >= 2]
    r.add("retention", 2, 2, len(late_new) >= 3,
          f"{len(late_new)} lines in the back half introduce new material (needs 3+)")

    # ---------------- ORIGINALITY (auto 12) ----------------
    me = next(c for c in concepts if c["id"] == meta["concept_id"])
    mine = content(me["core_mystery"] + " " + me["main_twist"] + " " + me["concept"])
    worst_sim, worst_id = 0.0, None
    for c in concepts:
        if c["id"] == me["id"]:
            continue
        s = jaccard(mine, content(c["core_mystery"] + " " + c["main_twist"] + " " + c["concept"]))
        if s > worst_sim:
            worst_sim, worst_id = s, c["id"]
    r.add("originality", 5, 5, worst_sim < 0.35,
          f"closest concept in the database is {worst_id} at {worst_sim:.2f} overlap (limit 0.35)")

    my_vo = content(vo)
    worst_vo, worst_vo_id = 0.0, None
    for other_id, other_vo in all_packages.items():
        if other_id == pid:
            continue
        s = jaccard(my_vo, other_vo)
        if s > worst_vo:
            worst_vo, worst_vo_id = s, other_id
    r.add("originality", 4, 4, worst_vo < 0.30,
          f"closest script is {worst_vo_id} at {worst_vo:.2f} vocabulary overlap (limit 0.30)")
    if worst_sim >= 0.35 or worst_vo >= 0.30:
        r.fire("resembles_another", f"concept {worst_id} {worst_sim:.2f} / script {worst_vo_id} {worst_vo:.2f}")

    triple = (me["anomaly_class"], me["twist_architecture"])
    same = [c["id"] for c in concepts
            if (c["anomaly_class"], c["twist_architecture"]) == triple and c["id"] != me["id"]]
    r.add("originality", 3, 3, len(same) <= 1,
          f"anomaly/twist pair {triple[0]}/{triple[1]} shared with {len(same)} other concept(s), cap 1")

    # ---------------- TWIST (auto 6) ----------------
    beat_i = next((i for i, l in enumerate(vo_lines) if "[BEAT]" in l), None)
    twist_line = vo_lines[beat_i].replace("[BEAT]", "").strip() if beat_i is not None else ""
    ov = jaccard(content(hook), content(twist_line))
    r.add("twist", 3, 3, ov < 0.5, f"twist/premise overlap {ov:.2f} (limit 0.50)")
    if ov >= 0.5:
        r.fire("twist_predictable", f"twist restates the premise ({ov:.2f} overlap)")
    pos = (beat_i / len(vo_lines)) if beat_i is not None else 0
    r.add("twist", 2, 2, beat_i is not None and 0.45 <= pos <= 0.85,
          f"twist beat at {pos:.0%} through the voiceover (target 45-85%)")
    before = set().union(*[content(l) for l in vo_lines[:beat_i]]) if beat_i else set()
    r.add("twist", 1, 1, len(content(twist_line) - before) >= 2,
          "twist line introduces at least two new terms")

    # ---------------- VISUAL (auto 5) ----------------
    r.add("visual", 2, 2, 8 <= len(scs) <= 12, f"{len(scs)} scenes (8-12)")
    distinct = sum(1 for i in range(1, len(scs))
                   if jaccard(content(scs[i]["visual"]), content(scs[i - 1]["visual"])) < 0.4)
    ratio = distinct / (len(scs) - 1)
    r.add("visual", 2, 2, ratio >= 0.8,
          f"{ratio:.0%} of cuts change the focal subject (needs 80%)")
    thin = [sc["n"] for sc in scs if words(sc["prompt"]) < 20]
    r.add("visual", 1, 1, not thin, f"all prompts specific enough{'' if not thin else ' - thin: ' + str(thin)}")

    # ---------------- CLARITY (auto 6) ----------------
    long_s = [s for s in sents if words(s) > 18]
    r.add("clarity", 2, 2, not long_s, f"{len(long_s)} sentences over 18 words")
    avg = vo_words / max(len(sents), 1)
    r.add("clarity", 2, 2, avg <= 11, f"average sentence {avg:.1f} words (max 11)")
    expo = sum(words(s) for s in sents if any(e in s.lower() for e in EXPOSITION))
    density = expo / vo_words
    r.add("clarity", 2, 2, density <= 0.15,
          f"exposition density {density:.0%} of the voiceover (max 15%)")
    if density > 0.15:
        r.fire("too_much_exposition", f"{density:.0%} of the voiceover is explanatory")

    # ---------------- remaining automated triggers ----------------
    raw = " ".join([vo, meta["youtube_title"], meta["description"],
                    " ".join(sc["prompt"] + " " + sc["visual"] for sc in scs)])
    blob = raw.lower()
    hits = sorted({p for p in PROTECTED if re.search(r"\b" + re.escape(p) + r"\b", blob)})
    for term in PROTECTED_AMBIGUOUS:
        for m in re.finditer(r"\b" + term + r"\b", raw):
            before = raw[:m.start()].rstrip()
            if before and before[-1] not in ".!?":   # capitalised mid-sentence = product name
                hits.append(term)
    hits = sorted(set(hits))
    if hits:
        r.fire("copyrighted_material", "names protected material: " + ", ".join(hits))

    claims = sorted({m for pat in FABRICATION for m in re.findall(pat, blob)})
    disclosed = (meta["description"].lower().startswith("original fiction")
                 and "fiction" in meta["pinned_comment"].lower())
    if claims or not disclosed:
        why = []
        if claims:
            why.append("news framing: " + ", ".join(claims))
        if not disclosed:
            why.append("fiction disclosure missing from description or pinned comment")
        r.fire("fabricated_claims", "; ".join(why))

    last = vo_lines[-1].strip()
    pair = content(" ".join(vo_lines[-2:]))
    new_at_end = pair - set().union(*[content(l) for l in vo_lines[:-2]])
    reasons = []
    if words(last) > 16:
        reasons.append(f"final line is {words(last)} words")
    if any(x in last.lower() for x in SUMMARY_ENDING):
        reasons.append("final line is a summary construction")
    if not new_at_end:
        reasons.append("closing pair introduces no new terms")
    if reasons:
        r.suspect("weak_ending", "; ".join(reasons))

    # ---------------- review ----------------
    rf = REVIEWS / f"{pid}.json"
    if rf.exists():
        rv = json.loads(rf.read_text())
        r.review = rv
        for t, fired in rv.get("triggers", {}).items():
            if fired:
                r.fire(t, "reviewer: " + rv["reasons"].get(t, "flagged"))
        for t, why in r.suspected.items():
            ov = rv.get("overrides", {}).get(t)
            if ov:
                r.overrides[t] = ov
            elif not rv.get("triggers", {}).get(t):
                r.fire(t, f"automated flag not answered by the reviewer ({why})")
    elif r.suspected:
        pass  # unreviewed scripts surface suspicions without rejecting on them
    return r, meta


def totals(r):
    auto = sum(r.auto.values())
    if not r.review:
        return auto, None, None
    rev = sum(r.review["scores"].values())
    return auto, rev, auto + rev


def verdict(r):
    auto, rev, total = totals(r)
    if r.triggers:
        return "REJECTED", total
    if r.review is None:
        return "UNREVIEWED", None
    return ("APPROVED" if total >= PASS_MARK else "REJECTED"), total


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--no-write" not in sys.argv
    concepts = [c for cat in json.loads(CONCEPTS.read_text())["categories"]
                for c in cat["concepts"]]
    dirs = sorted(p for p in OUT.iterdir() if p.is_dir() and p.name.isdigit())
    if args:
        dirs = [p for p in dirs if p.name in args]
    all_vo = {}
    for p in sorted(x for x in OUT.iterdir() if x.is_dir() and x.name.isdigit()):
        _, _, lines = load_package(p)
        all_vo[p.name] = content(" ".join(lines))

    rows = []
    for d in dirs:
        r, meta = score_package(d.name, all_vo, concepts)
        v, total = verdict(r)
        rows.append((r, meta, v, total))
        auto, rev, _ = totals(r)
        shown = f"{total}/100" if total is not None else f"auto {auto}/51, awaiting review"
        print(f"[{v:^10}] {d.name} {meta['working_title']:<24} {shown}")
        for name, why in r.triggers.items():
            print(f"             REJECT TRIGGER - {name}: {why}")
        for dim, pts, mx, ok, desc in r.checks:
            if not ok:
                print(f"             lost {mx - pts} on {dim}: {desc}")

    if write:
        write_ledger(rows, concepts)
    failing = sum(1 for _, _, v, _ in rows if v != "APPROVED")
    print(f"\n{len(rows)} scripts reviewed, {len(rows) - failing} approved, {failing} not approved.")
    return 1 if failing else 0


def write_ledger(rows, concepts):
    hist = json.loads(HISTORY.read_text()) if HISTORY.exists() else {}
    stamp = datetime.date.today().isoformat()
    for r, meta, v, total in rows:
        rnd = (r.review or {}).get("round", 1)
        entry = {"round": rnd, "date": stamp, "verdict": v, "total": total,
                 "auto": r.auto, "auto_total": sum(r.auto.values()),
                 "review": (r.review or {}).get("scores"),
                 "reasons": (r.review or {}).get("reasons"),
                 "notes": (r.review or {}).get("notes"),
                 "triggers": r.triggers,
                 "suspected": r.suspected,
                 "overrides": r.overrides,
                 "failed_checks": [f"{d}: {desc}" for d, p, m, ok, desc in r.checks if not ok],
                 "rewrite_note": (r.review or {}).get("rewrite_note")}
        log = hist.setdefault(r.id, {"title": meta["working_title"],
                                     "concept_id": meta["concept_id"], "rounds": []})
        log["title"] = meta["working_title"]
        log["rounds"] = [x for x in log["rounds"] if x["round"] != rnd] + [entry]
        log["rounds"].sort(key=lambda x: x["round"])
    HISTORY.write_text(json.dumps(hist, indent=2, ensure_ascii=False) + "\n")
    LEDGER.write_text(render_ledger(hist))
    print(f"\nledger written to {LEDGER.relative_to(ROOT)}")


def render_ledger(hist):
    from textwrap import dedent
    L = [dedent(f"""\
    # Quality Control

    Every script is scored out of 100 before it can be approved. Nothing is produced
    from an unapproved script.

    **Minimum approval score: {PASS_MARK}/100. Maximum {MAX_REWRITES} rewrites, after which
    the script is retired and its concept returns to the pool.**

    ## The rubric

    | Dimension | Weight | Automated | Review |
    |---|---|---|---|
    | Hook | 25 | 10 | 15 |
    | Retention structure | 20 | 12 | 8 |
    | Originality | 20 | 12 | 8 |
    | Twist / payoff | 15 | 6 | 9 |
    | Visual potential | 10 | 5 | 5 |
    | Clarity | 10 | 6 | 4 |
    | **Total** | **100** | **51** | **49** |

    The automated half is measured from the built package by `shorts/_system/qc.py`.
    The review half is editorial judgment, recorded per script in
    `shorts/_system/reviews/<id>.json` and reproduced in full below. **A script with no
    review on file cannot be approved** - the engine reports UNREVIEWED rather than
    guessing, because no automated check can tell you whether a twist is surprising.

    Automated checks are proxies tuned to catch failure, not to certify success. Passing
    all of them means nothing obvious is broken, not that the script is good.

    ## Rejection triggers

    Any one of these rejects the script outright, whatever it scored.

    | Trigger | How it is caught |
    |---|---|
    | Weak hook | Automated: over 12 words or a banned opener. Review: strength judgment |
    | Confusing story | Review |
    | Predictable twist | Automated: twist restates the premise (>= 0.50 overlap). Review: judgment |
    | Resembles another story | Automated: >= 0.35 concept overlap with the database, or >= 0.30 vocabulary overlap with another script |
    | Too much exposition | Automated: explanatory sentences exceed 15% of the voiceover |
    | Nothing meaningful for over 8s | Automated: longest stretch introducing no new on-screen information |
    | Weak ending | Automated: final line over 14 words, a summary construction, or introducing nothing new. Review: judgment |
    | Depends on copyrighted material | Automated: protected-name list across script, prompts, title and description |
    | Feels mass-produced | Review |
    | Fabricated real-world claims | Automated: news-framing phrases, or a missing fiction disclosure |

    ## Calibration note

    Scripts built through `shorts/_system/build.py` tend to score 50 or 51 out of 51 on the
    automated half, because the builder and the format validator enforce the same rules the
    automated checks measure. That is expected, and it means the automated half is a floor,
    not a discriminator: on pipeline-built scripts every point of real variation lives in
    the 49 review points.

    It also means **the 85 threshold is not what protects quality here - the triggers are.**
    Of the three scripts rejected in the first round, one scored 92 and one scored 87; both
    would have passed on score alone. Treat a high total as evidence that nothing is broken,
    and the trigger list as the actual gate.

    ## Running it

    ```bash
    python3 shorts/_system/qc.py          # score every script, rewrite this ledger
    python3 shorts/_system/qc.py 003      # score one
    ```

    ---

    # Ledger
    """)]

    approved = [i for i, v in hist.items() if v["rounds"][-1]["verdict"] == "APPROVED"]
    rewritten = [i for i, v in hist.items() if len(v["rounds"]) > 1]
    L.append(f"\n{len(hist)} scripts scored, {len(approved)} approved, "
             f"{len(rewritten)} required a rewrite.\n")
    L.append("\n| Script | Title | Rounds | Final | Verdict |")
    L.append("|---|---|---|---|---|")
    for i in sorted(hist):
        h = hist[i]
        last = h["rounds"][-1]
        L.append(f"| {i} | {h['title']} | {len(h['rounds'])} | "
                 f"{last['total'] if last['total'] is not None else '-'}/100 | **{last['verdict']}** |")

    for i in sorted(hist):
        h = hist[i]
        L.append(f"\n---\n\n## {i} — {h['title']}\n")
        L.append(f"Concept `{h['concept_id']}`\n")
        for rd in h["rounds"]:
            L.append(f"### Round {rd['round']} — {rd['verdict']} "
                     f"({rd['total'] if rd['total'] is not None else 'unscored'}/100) · {rd['date']}\n")
            if rd.get("rewrite_note"):
                L.append(f"*Rewrite made before this round:* {rd['rewrite_note']}\n")
            if rd["review"]:
                L.append("| Dimension | Auto | Review | Score | Weight |")
                L.append("|---|---|---|---|---|")
                for dim in WEIGHTS:
                    L.append(f"| {dim.title()} | {rd['auto'][dim]}/{AUTO_MAX[dim]} | "
                             f"{rd['review'][dim]}/{REVIEW_MAX[dim]} | "
                             f"**{rd['auto'][dim] + rd['review'][dim]}** | {WEIGHTS[dim]} |")
                L.append(f"| **Total** | {rd['auto_total']}/51 | "
                         f"{sum(rd['review'].values())}/49 | **{rd['total']}** | 100 |\n")
            if rd.get("overrides"):
                L.append("**Automated flags overridden by the reviewer:**\n")
                for t, why in rd["overrides"].items():
                    L.append(f"- `{t}` — flagged because {rd['suspected'].get(t, 'n/a')}. "
                             f"Overridden: {why}")
                L.append("")
            if rd["triggers"]:
                L.append("**Rejection triggers fired:**\n")
                for t, why in rd["triggers"].items():
                    L.append(f"- `{t}` — {why}")
                L.append("")
            if rd["failed_checks"]:
                L.append("**Automated checks failed:**\n")
                for c in rd["failed_checks"]:
                    L.append(f"- {c}")
                L.append("")
            if rd["reasons"]:
                L.append("**Review reasoning:**\n")
                for dim, why in rd["reasons"].items():
                    L.append(f"- **{dim}** — {why}")
                L.append("")
            if rd.get("notes"):
                L.append(f"**Verdict note.** {rd['notes']}\n")
    L.append("\n---\n\n*Every script assessed here is original fiction. "
             "The fabricated-claims trigger exists to keep it labelled that way.*\n")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
