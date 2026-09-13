# Script generation system

Ten production packages are built. The system that builds them is reusable for the
remaining ninety.

## How it works

One **source object** per Short is the single point of truth. `build.py` renders it into
the five delivery files; `validate.py` gates the result against the format rules. You never
hand-edit a file inside `shorts/001/` — you edit the source and rebuild, so the script, the
scene list, the prompts and the metadata can never drift out of sync.

```
shorts/_system/sources/*.json   authored source - the only file you edit
        |
        |  python3 shorts/_system/build.py [id ...]
        v
shorts/<id>/script.txt          full package, human-readable, all 14 outputs
            voiceover.txt       VO only, for the booth or the TTS call
            scenes.json         8-12 scenes with timings, captions, prompts, SFX
            metadata.json       hooks, twist, title, description, hashtags, pinned
            visual_prompts.txt  numbered generation prompts, one per scene
        |
        |  python3 shorts/_system/validate.py
        v
    PASS / FAIL per package
```

## Commands

```bash
python3 shorts/_system/build.py            # rebuild every package
python3 shorts/_system/build.py 004 007    # rebuild selected IDs
python3 shorts/_system/validate.py         # gate all packages, non-zero exit on failure
```

## What the build does for you

**Character and style locks.** Each source carries a `character_lock` and a `style_lock`
string. The build appends both to every scene prompt automatically, along with the 9:16
framing instruction. Character consistency is therefore enforced mechanically rather than
by remembering to retype a description ten times — change the lock once and every prompt in
the Short updates.

**Word and timing maths.** Word counts and estimated runtime are computed from the VO at
3.0 words per second and written into the rendered files, so a script that has drifted out
of budget is visible without counting anything by hand.

## What validate.py enforces

| Rule | Check |
|---|---|
| Voiceover length | 100–140 words |
| Runtime | 35–55s estimated, and the scene timeline must also end in range |
| Opener | No banned opener (`did you know`, `imagine`, `what if I told you`, …) |
| Sentence length | Nothing over 18 words; warns above an 11-word average |
| Scenes | 8–12 per Short |
| Pace | No scene longer than 8s, and no gap or overlap in the timeline |
| Captions | Maximum 6 words; warns if nothing is emphasised in caps |
| Prompts | Every prompt carries the aspect ratio |
| Hooks | Exactly 3 written, exactly 1 selected, and the VO must open with it |
| Publishing | Exactly 3 hashtags; description opens with the fiction disclosure; pinned comment carries it |

All ten current packages pass with zero errors.

## The ten built

| Folder | Concept | Title | VO words | Scenes | Runtime |
|---|---|---|---|---|---|
| 001 | PIX-002 | One Frame Longer | 114 | 10 | 48s |
| 002 | CAM-009 | From Behind | 116 | 10 | 49s |
| 003 | HOME-005 | The Extra Room | 115 | 10 | 47s |
| 004 | PH-003 | One Step Closer | 127 | 10 | 46s |
| 005 | CAM-001 | The Hour Ahead | 117 | 10 | 48s |
| 006 | EXP-005 | Still Online | 114 | 10 | 47s |
| 007 | PH-019 | Significant Locations | 113 | 10 | 48s |
| 008 | PIX-004 | Nineteen Ninety-Eight | 112 | 10 | 47s |
| 009 | EXP-001 | Sold From Your House | 113 | 10 | 47s |
| 010 | CAM-004 | Arrivals | 111 | 10 | 45s |

## Adding the next batch

1. Copy a source object, change the `id` and `concept_id`, and pull the concept's hook,
   core mystery, twist and final revelation from `content/100_short_concepts.json`.
2. Write three hooks, pick one, and write the rationale — the selected hook must be the
   first line of the voiceover.
3. Write the VO to 100–140 words, marking `[BEAT]` before the twist line.
4. Lay out 8–12 scenes covering the full timeline with no gaps, each 8s or less.
5. Set the character and style locks once.
6. `build.py` then `validate.py`. Fix what it reports. Nothing ships red.

---

*Every Short produced by this system is original fiction and is labelled as such in the
description, the pinned comment, and an on-screen tag from 0:02 onward.*
