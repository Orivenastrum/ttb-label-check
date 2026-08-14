# Architecture — Alcohol Label Verification

Design goal, stated bluntly: **the smallest thing that satisfies
[01-REQUIREMENTS.md](01-REQUIREMENTS.md) §1 and can be read end-to-end in ten
minutes.** The grading org's founding thesis is that impressive architecture is how
$40M contracts happen. Simplicity here is a scored feature, not a compromise.

---

## 1. Shape

```
  Browser (single page)
        │  POST /api/verify        (one image + expected fields)
        │  POST /api/verify/batch  (N images, SSE progress)
        ▼
  Next.js app  ──────────────────────────────────────────────┐
        │                                                     │
        │  verify(image, expected) ─┬─ extract_label()  ──────┼──▶ Vision API
        │                           │      (the ONLY network hop)
        │                           ├─ match_brand()    (pure, local)
        │                           ├─ match_warning()  (pure, local)
        │                           └─ match_fields()   (pure, local)
        │                                                     │
        └─ timing middleware → per-stage ms into the response ┘
```

One process. One network dependency. Everything after extraction is pure functions
over strings — which is also why it is fast and trivially testable.

**Stack:** Next.js (App Router) + TypeScript, deployed on Vercel. Chosen for one
reason: it is the shortest path from `git push` to a live URL a stranger can open
(R7), and R7 is the requirement most submissions fail. See §6 for the government-cloud
note.

---

## 2. Modules

```
app/
  page.tsx                  single-label UI (R6)
  batch/page.tsx            batch UI + progress (R5)
  api/verify/route.ts       single verify
  api/verify/batch/route.ts batch, SSE progress
lib/
  extract.ts                extract_label(image) -> LabelFields   ← the swap seam
  match/brand.ts            fuzzy matcher (R3)
  match/warning.ts          byte-exact matcher (R4)
  match/index.ts            verdict assembly
  timing.ts                 stage timer
  types.ts
test/
  match.test.ts             the matcher table below
  latency.test.ts           the timing harness (R2)
fixtures/labels/            ~16 generated labels (incl. deliberate defects) +
                            ~4 real COLA labels for timing; expected.json per label
                            (see 01-REQUIREMENTS.md §5)
```

`extract.ts` is the only file that knows a vendor exists. That is the Marcus seam.

---

## 3. Data model

```ts
// The five fields are taken verbatim from the brief's "Example Distilled Spirits
// Label Fields" block. That list is the schema — do not invent a sixth field.
type LabelFields = {
  brandName:        string | null   // "OLD TOM DISTILLERY"
  classType:        string | null   // "Kentucky Straight Bourbon Whiskey"
  alcoholContent:   string | null   // raw text, e.g. "45% Alc./Vol. (90 Proof)"
  netContents:      string | null
  warningStatement: string | null   // raw, unnormalized
  rawText:          string          // full OCR dump, kept for the diff view
}

type CheckResult = {
  field:    keyof LabelFields
  status:   'MATCH' | 'MATCH_WITH_NOTE' | 'MISMATCH' | 'MISSING'
  expected: string | null
  found:    string | null
  note?:    string          // e.g. "capitalization differs"
  diff?:    { at: number; expected: string; found: string }   // R4 only
}

type Verdict = {
  overall: 'PASS' | 'PASS_WITH_NOTES' | 'FAIL'
  checks:  CheckResult[]
  timing:  { upload: number; extract: number; match: number; total: number }
}
```

`overall` rule: any `MISMATCH`/`MISSING` → `FAIL`; else any `MATCH_WITH_NOTE` →
`PASS_WITH_NOTES`; else `PASS`. Returning `timing` in the API response is deliberate —
it puts the R2 evidence in front of the grader without them asking.

---

## 4. The 5-second budget (R2)

This is **my** budget, derived from Sarah's "about 5 seconds." Nothing in the brief
specifies a latency requirement. State it that way in the README, publish the measured
numbers whatever they are, and do not manufacture a p95 figure the harness did not
produce. Allocation:

| Stage | Budget (p95) | Notes |
|---|---|---|
| Client upload + resize | 600 ms | **Resize client-side** to max 1600px long edge, JPEG q0.8. A 12MP phone photo is 5 MB; this makes it ~300 KB. Biggest single win, costs 10 lines. |
| Request transit | 200 ms | |
| Vision extraction | 3000 ms | The only variable stage. One call, one image, structured-output request. |
| Matching | 50 ms | Pure string ops. |
| Response + render | 300 ms | |
| **Slack** | **850 ms** | |

Rules that keep it inside budget:
- **One** model call per label. Not one per field. If you find yourself making a
  second call to "double-check", the design is wrong.
- Ask for structured output (JSON schema / tool call) so there is no parse-retry loop.
- Cap output tokens. The full `rawText` dump is the biggest cost — cap it.
- Hard timeout at 8s with an honest error, not a hang. A timeout that says "extraction
  timed out, retry" beats a spinner forever (invariant: no silent failure).
- **Instrument in commit one.** `timing.ts` exists before `extract.ts` does. If you
  discover you are at 9 seconds on day six, you have no time to fix it.

Batch (R5, **tier 2** — cut it first if the hour runs out): bounded concurrency of **8**
in-flight extractions, SSE progress events per item, partial results streamed as they
land. 250 items ÷ 8 × ~3s ≈ 95 s. Show a per-item list that fills in, not a single
indeterminate bar — Janet needs to know *which* labels failed, not just that some did.
Batch is a loop over the single-label path; if it starts wanting its own abstractions,
that is the over-engineering the hiring team named, and the correct move is to drop it
and say so in the README.

---

## 5. Matcher test table (write these first)

| Expected | Found | Field | Expected result |
|---|---|---|---|
| `Stone's Throw` | `STONE'S THROW` | brand | `MATCH_WITH_NOTE` |
| `Stone's Throw` | `Stone’s Throw` (curly) | brand | `MATCH` |
| `Stone's Throw` | `Stones Throw` | brand | `MATCH` |
| `Stone's Throw` | `Stone's Throw Winery` | brand | `MISMATCH` |
| canonical warning | canonical warning | warning | `MATCH` |
| canonical warning | `Government Warning:` … | warning | `MISMATCH` + diff at 0 |
| canonical warning | canonical with `  ` double space | warning | `MATCH` |
| canonical warning | canonical missing `(2)` clause | warning | `MISMATCH` + diff |
| canonical warning | absent from label | warning | `MISSING` |

These nine rows are the core of the assignment. They are also the place a model will
generate confident, wrong code — one shared "smart" matcher that passes the brand cases
and quietly normalizes case out of the warning check. **Write the table as tests before
you let anything generate the matchers.**

---

## 6. Deploy

Vercel. `git push` → live URL. Put the URL in the README at the top, not the bottom.

README must include this paragraph (R8 / Marcus):

> This prototype calls a hosted vision API for text extraction. In a network-restricted
> agency environment that egress may not be permitted. Extraction is isolated behind a
> single interface (`lib/extract.ts`); a self-hosted OCR implementation (PaddleOCR or
> Tesseract plus the same field-parsing rules) drops in behind it without touching the
> matching, API, or UI layers. The matching logic — which is where the compliance
> rules actually live — runs entirely locally and makes no network calls.

Also note: government cloud (Azure Gov / AWS GovCloud) would be the real target; the
app is a standard containerizable Node service with one outbound dependency, so the
port is mechanical.

---

## 7. UI (R6)

One screen. One drop zone. One big button. Results as a vertical list of plain-language
rows with a green check / amber note / red X, and the *reason* in a full sentence
("The warning statement is missing the second sentence about operating machinery").

Non-negotiables: 18px+ base font, 44px+ tap targets, no hover-only affordances, no
modals, no icon-only controls, errors in plain English with a next action. Batch is a
second page reachable by one obvious link — do not put a mode toggle on the main screen.

The test is not a checklist: hand the URL to someone non-technical, say nothing, watch.
Every hesitation is a bug.

---

## 8. Build order — the one-hour clock

Wall-clock budget for the MVP run. Keep `04-PROCESS-LOG.md` open the whole time and drop
a line in it at every step boundary; reconstructing it afterward reads as reconstructed.

| Min | Step | Cut rule |
|---|---|---|
| — | ~~Verify the §16.21 warning text~~ — **already done before the clock starts** (verified 2026-08-10 against the eCFR API; see `01`). Copy the constant in. | n/a |
| 0–6 | `create-next-app`, push, **deploy to Vercel, open the live URL** | never cut — a dead link is the only unrecoverable failure |
| 8–18 | `types.ts` + the nine-row matcher table as tests + both matchers. Pure, no network. Green. | never cut |
| 18–22 | `timing.ts` — before `extract.ts` exists | never cut |
| 22–34 | `extract.ts`: one vision call, structured output, hard 8s timeout | never cut |
| 34–42 | `/api/verify` + the single-label UI. Ship it to the live URL again. | never cut |
| 42–50 | Generate the fixture corpus; run the bench; record real p50/p95 | shrink the corpus, not the measurement |
| 50–58 | Batch route + batch UI (**tier 2**) | **cut this first** |
| 58–60 | Final push; confirm the live URL works in a private window | never cut |

Then, in the week that follows: cold-open test with a non-technical person and fix every
hesitation; write `README.md` from `03-README-SKELETON.md`; shape the running log into
`PROCESS.md` (see `04-PROCESS-LOG.md`). No new features.
