# The Internet Found Something That Shouldn't Exist
## Production plan for 100 original Shorts

**Format:** YouTube Shorts · 35–55s · vertical 9:16 · English (international) · original fiction
**Primary metric:** retention (3-second hold, then average view duration as % of length)
**Status:** plan only — no stories written yet

---

## 1. The core problem

Making one good Short is a writing task. Making 100 is an **inventory problem**.
Channels in this genre die the same way every time: around video 15 the creator
runs out of genuinely new anomalies and starts shipping re-skins — same shape,
new device. Viewers feel it before they can name it, and retention decays.

So the system below is built around one guarantee:

> **No two of the 100 may share the same combination of
> (surface, anomaly class, twist architecture).**
> This is a mechanical rule, checked by a script, not a matter of taste.

Everything else — the beat template, the word budgets, the QC gates — exists to
make each individually good. The combinatorics are what make 100 *different*.

---

## 2. Story DNA: nine axes

Every story is a row of nine coordinates, assigned **before** a word is written.
Writing starts from the coordinates; it never starts from a blank page.

### Axis A — Surface (18)
The technology the mystery lives inside. Your list, unchanged:

phones · AI · security cameras · mapping apps · old computers · text messages ·
smart homes · deleted accounts · photographs · livestreams · GPS · voice
assistants · video calls · cloud storage · online marketplaces · digital
archives · mysterious websites · future technology

*Cap: 5–6 stories per surface across the 100.*

### Axis B — Anomaly class (12)
**What kind of impossible it is.** This is the deepest axis — it's what stops two
stories about phones from being the same story.

| # | Class | The impossibility |
|---|---|---|
| B1 | Wrong Time | Content exists before the thing it records happened |
| B2 | Wrong Place | A location that can't exist, or geography that doesn't close |
| B3 | Wrong Person | Someone present who shouldn't be; an identity that won't resolve |
| B4 | Wrong Count | The numbers don't reconcile — one extra, one missing |
| B5 | Persistence | It refuses deletion. It comes back |
| B6 | Recursion | The system contains itself |
| B7 | Prediction | The system knows what hasn't happened yet |
| B8 | Substitution | Something was quietly replaced; only the record disagrees |
| B9 | Absence | Something remembered is missing from every system that should hold it |
| B10 | Address | The system is speaking specifically to *this* person |
| B11 | Translation | Meaningless data resolves into meaning |
| B12 | Propagation | The anomaly moves to other devices, accounts, people |

### Axis C — Discovery vector (10)
How they stumble on it: routine maintenance · a notification · someone else's
report · a hardware fault · a secondhand purchase · an inheritance · a shared
account glitch · an automated report · idle browsing · an ordinary work task

### Axis D — Lens (12)
Who we're behind. Defined by role, not name — names localize badly and cost
words: night-shift monitor · teenager · IT admin · digital archivist · estate
cleaner · content moderator · delivery driver · retiree new to the tech · QA
tester · small-business owner · insurance adjuster · amateur mapper

*Cap: max 9 uses of any lens.*

### Axis E — Investigation mechanic (8)
**What the viewer watches during 10–25s.** This axis exists purely to protect
the mid-video retention dip: cross-reference two records · go to the physical
location · ask the system a direct question · compare timestamps · follow a
link or coordinate · bring in a second witness · run a deliberate test · check
the backups

### Axis F — Escalation engine (6)
What makes 25–40s worse, not just longer:

1. **It notices you noticing**
2. **The scope was always bigger** — it isn't one file, one camera, one night
3. **It's spreading** — to the next device, the next account
4. **The clock is closing** — the predicted moment is approaching
5. **Someone else is already inside it** — a second party, ahead of them
6. **The evidence edits itself** — proof degrades while they hold it

### Axis G — Twist architecture (7)
The 40–50s turn. Not the twist *content* — the **shape** of the reversal:

| # | Architecture | The reversal |
|---|---|---|
| G1 | Identity inversion | The protagonist (or their ally) is the subject or source |
| G2 | Temporal inversion | The record came first; events followed it |
| G3 | Scope inversion | Never about one person — it's systemic |
| G4 | Agency inversion | Not a malfunction. Deliberate. Someone or something is operating it |
| G5 | Observer inversion | They were the ones being documented |
| G6 | Causality inversion | The investigation created the anomaly |
| G7 | Category inversion | The thing assumed to be X is a different category entirely |

### Axis H — Closing mode (6)
The last five seconds: unanswered question · implication that reframes
everything before it · direct address to the viewer · a quiet physical detail ·
a countdown to a next event · direct contradiction of the opening line

### Axis I — Tone (5)
clinical dread · melancholy · paranoid · awe · deadpan-unsettling

---

## 3. The uniqueness contract

Assign all 100 DNA rows **up front**, in one sitting, before any scripting.
A validation script enforces:

1. **Primary key** `(A, B, G)` is unique across all 100. *(1,512 combinations exist; we use 100.)*
2. **Pair cap:** any `(B, G)` pair appears at most **twice**, and when it appears twice the two stories must differ on **both** A (surface) and F (escalation engine).
3. **Surface cap:** 5–6 per surface. **Lens cap:** ≤ 9. **Anomaly cap:** 8–9 each. **Twist cap:** 14–15 each.
4. **Adjacency rule:** consecutive publishes never repeat surface, anomaly class, or twist architecture. The *feed* must feel varied, not just the spreadsheet.
5. **Logline similarity:** token-overlap score against every previously approved logline must stay under threshold. Two hits on the same axis pair → forced rewrite, not a nudge.
6. **Outcome variety:** protagonist outcomes distributed across resolved / escaped / complicit / absorbed / unknown, roughly 20 each. Same-ending fatigue is as real as same-premise fatigue.
7. **Explanation variety:** roughly 40 of 100 explain the mechanism; 60 deliberately don't. All-mystery reads as a channel with no answers; all-answers kills the rewatch.

**Why this holds up:** 12 anomaly classes × 7 twist architectures = 84 unique
shapes before surfaces are considered. Surfaces then multiply that by 18. The
scarcity is never in the math — it's in discipline, and the script supplies it.

---

## 4. Originality guard

Three layers, run at the logline stage where rewrites are cheap.

**Layer 1 — Premise blocklist.** A maintained list of premises that belong to
well-known existing works. Any logline landing on one is rejected at intake.
Kept as a written, growing file; reviewed each sprint.

**Layer 2 — Familiarity check.** For each approved logline, search the core
premise. If it maps one-to-one onto an existing known story, change the
**anomaly class** (Axis B), not the surface. Changing the device is a re-skin;
changing the impossibility is a new story.

**Layer 3 — Internal similarity.** The script from §3.5, run against our own catalog.

**Two standing craft rules that do more work than any filter:**

- **The twist may not be the premise.** If the logline and the twist are the same sentence, there's no story between them — only a wait.
- **The twist must be earned by something visible before 25s.** If a viewer rewatching can't find the seed, the twist is arbitrary, and arbitrary twists train viewers to stop trusting the channel.

---

## 5. Fiction policy (non-negotiable)

These stories are original fiction and are never presented otherwise.

| Where | What it says |
|---|---|
| Channel About | "Original fiction. These stories are invented." |
| Every description, **first line** | "Original fiction — not a real event." |
| On-screen | Small persistent "FICTION" tag from ~2s onward (kept out of 0–2s so it never competes with the hook) |
| Pinned comment | One line restating it |

**Hard rules:**
- No real brands, products, companies, apps, or platforms. Use invented stand-ins from a maintained registry (an invented maps app, an invented marketplace). One registry, reused, also builds a shared universe for free.
- No real people, public figures, or celebrities.
- No real place names attached to invented crimes or disappearances.
- No news framing, no "leaked footage", no "real recording", no fake documentation.
- Titles and thumbnails may not assert that the event is true. Curiosity, never claim.
- If realistic AI-generated footage is used, tick YouTube's altered/synthetic content disclosure.
- Violence stays implied and off-screen. The genre's power is dread, not gore — and the ad-friendliness is a bonus, not the reason.

---

## 6. Script template and word budgets

Fast Shorts narration runs ~170–190 words/minute — about 2.9–3.2 words/second.

| Length | Total words |
|---|---|
| 35s | 95–110 |
| 45s | 125–140 |
| 55s | 155–175 |

**Per-beat budget (45s target):**

| Beat | Time | Words | Requirement |
|---|---|---|---|
| Hook | 0–2s | 5–9 | One sentence. Contains the anomaly noun. Zero setup |
| Discovery | 2–10s | 22–28 | The impossible thing, stated plainly |
| Investigation | 10–25s | 40–48 | The Axis E mechanic, on screen |
| Escalation | 25–40s | 40–48 | The Axis F engine, two distinct worsenings |
| Twist | 40–50s | 26–32 | The Axis G reversal. Half-second of silence before it |
| Close | 50–55s | 8–14 | The Axis H mode. Last line is the sharpest line |

**Line-level rules:**
- Average sentence ≤ 11 words. No sentence over 18.
- Present tense. Active voice.
- Something changes every 5–8 seconds: new information, escalation, a question, a visual change, or a revelation. The beat sheet marks each of these changes explicitly — if a 6-second window has none, the script fails QC.
- No throat-clearing. Banned openers: "Did you know", "Once upon a time", "This is the story of", "You won't believe", "Welcome back". Also banned by extension: "Imagine", "What if I told you", "In [year]".
- Cut every word that only carries grammar. At 3 words/second, exposition is the enemy.

**Specimen hook lines** (to show the shape — *not* stories from the 100):
- "The camera recorded tomorrow night."
- "Her contacts list has one more person than it did this morning."
- "The house answered a question nobody asked."

---

## 7. Pipeline: stage-batched, not video-batched

Process ten videos through **one stage at a time**. This is the single largest
quality and speed decision in the plan: batching by stage keeps narrative voice
consistent, makes duplicate-detection trivial (ten loglines side by side), and
kills the context-switching that makes solo production slow.

| # | Stage | Output | Gate |
|---|---|---|---|
| 0 | DNA assignment | 10 locked coordinate rows | Uniqueness script passes |
| 1 | Loglines | 10 × one sentence | Originality guard §4 |
| 2 | Beat sheets | 10 × six beats + marked change-points | A change every ≤8s |
| 3 | Scripts | 10 × VO script in word budget | Read aloud against a stopwatch |
| 4 | Hook pass | 3 alternate hooks per script, 1 chosen | Strongest, not first |
| 5 | Shot lists | 6–10 shots each, 9:16 | Visual change every ≤4s |
| 6 | Assets | Images / video / on-screen text | No real brands or faces |
| 7 | Voiceover | One consistent narrator voice | Timing inside ±3s of target |
| 8 | Edit | Cut, sound design, captions | Captions on. No silent dead air |
| 9 | QC | §8 checklist | All 12 gates |
| 10 | Publish | Title, description, tag, pin | Fiction policy §5 satisfied |

**Toolchain note:** this workspace has the Higgsfield MCP server connected —
`generate_image_batch` / `generate_video_batch` for stage 6, `generate_audio`
for stage 7, `shorts_studio_create` for assembly, `virality_predictor` for
stage 4 hook selection, and TikTok publishing for cross-posting. Worth
prototyping on the first batch of 10 before committing the pipeline to it.

---

## 8. QC: 12 gates

A Short ships only when all twelve pass.

1. Runtime 35–55s.
2. First spoken line is the strange event — no setup, no banned opener.
3. Hook is under 9 words and names the anomaly.
4. A change (information / escalation / question / visual / revelation) every ≤8s, marked in the beat sheet.
5. The twist is seeded before 25s and the seed is findable on rewatch.
6. The twist is not a restatement of the premise.
7. Final line is the strongest line in the script.
8. DNA row unique per §3; adjacency rule satisfied against the last three publishes.
9. Originality guard clear; no real brand, person, or place.
10. Fiction disclosure present in all four places.
11. No graphic violence; nothing that reads as real documentation.
12. Watched start to finish on a phone, sound on, at arm's length. Any moment where attention drops is a rewrite, not a note.

---

## 9. Schedule

**Sprint 0 — system build (1 week).** Repo scaffold, the 100 DNA rows assigned
and validated, uniqueness script written, fictional-brand registry, premise
blocklist, script and beat-sheet templates, narrator voice locked, visual
identity locked (typeface, caption style, color grade, sound palette).
*Nothing ships. This is the week that makes videos 60–100 possible.*

**Sprints 1–10 — ten videos each.** Stage-batched per §7.

Rough solo effort per batch of ten: DNA + loglines 2h · beat sheets 3h ·
scripts 4h · hooks 1h · shot lists 3h · assets 6–10h · VO 2h · edit 8–12h ·
QC 2h. Call it **30–40 hours per 10**, dropping toward the low end by sprint 3
as templates harden.

**Publishing cadence:** ship on a fixed schedule, decoupled from production, with
at least two sprints of buffer built before the first upload. A backlog is what
lets you keep quality when a week goes badly.

**Review checkpoints at videos 10, 30, 60.** At each: re-read the axis
distribution, retire what's underperforming, and re-cut remaining DNA rows if
the data says a whole anomaly class isn't landing.

---

## 10. Retention feedback loop

Track per video: 3-second hold · average view percentage · the timecode of the
largest drop-off · rewatch rate · comment-to-view ratio.

Then tag each video by its axis coordinates and read retention **by axis**. This
is the part most channels never do, and it's where the compounding is:

- Which **anomaly classes** hold past 3 seconds?
- Which **twist architectures** produce rewatches?
- Which **closing modes** produce comments? (Comments are the proxy for "I need to know what happens.")
- Where is the median drop-off timecode, and is it always the same beat?

**Decision rules:**
- A drop-off clustering at the same beat across a batch → the beat template is wrong; fix the template, not the scripts.
- An anomaly class in the bottom quartile for 3-second hold twice → stop assigning it, reallocate its remaining rows.
- A class in the top quartile → allow it one extra slot above cap, but never at the cost of a `(B, G)` collision.

The uniqueness contract is never relaxed by performance data. Data changes *which*
combinations get used — never *whether* they're distinct.

---

## 11. Repo layout (Sprint 0 deliverable)

```
shorts-channel/
├── PROJECT-PLAN.md            # this file
├── taxonomy/
│   ├── axes.json              # the nine axes, canonical IDs
│   ├── caps.json              # distribution caps and adjacency rules
│   └── fictional-brands.md    # invented stand-in registry
├── catalog/
│   ├── dna.csv                # the 100 locked rows
│   ├── loglines.md
│   └── blocklist.md           # premise blocklist
├── templates/
│   ├── beat-sheet.md
│   ├── script.md
│   └── shot-list.md
├── scripts/
│   ├── validate-dna.mjs       # enforces §3 — exits non-zero on collision
│   └── similarity.mjs         # logline overlap scoring
├── episodes/001..100/
│   ├── dna.json · logline.md · beats.md · script.md · shots.md · qc.md
└── analytics/
    └── retention.csv          # per-video metrics, joined to DNA for §10
```

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Sameness creeps in by video 40 | §3 contract, enforced by script, assigned up front |
| A story accidentally mirrors an existing work | §4 three-layer guard at logline stage |
| Read as real events | §5, four disclosure surfaces, no news framing |
| Asset generation becomes the bottleneck | Stage-batching; a locked visual identity so assets are recombinable |
| Quality drops under cadence pressure | Two-sprint buffer before first publish |
| Retention data reshapes the channel into one repeated formula | Caps and adjacency rule are never overridden by performance |
| Burnout at scale | 10-video sprints with a defined end; Sprint 0 front-loads every recurring decision |

---

## 13. What happens next

On approval, Sprint 0 runs in this order:

1. Scaffold the repo layout in §11.
2. Write `validate-dna.mjs` and `similarity.mjs` first — the guardrails before the content.
3. Assign and validate all 100 DNA rows.
4. Build the fictional-brand registry and premise blocklist.
5. Lock templates, narrator voice, and visual identity.
6. Then — and only then — write the first 10 loglines.

No stories are written until the uniqueness contract is machine-checked and green.
