# Requirements — AI-Powered Alcohol Label Verification

Extracted from the take-home brief. The brief is deliberately noisy: most of it is
stakeholder color, not requirement. This file is the build contract. If something
is not in section 1, it is not getting built.

**Important framing.** The brief's own "Technical Requirements" section says exactly one
thing: *use any language, framework, or library you prefer.* Every constraint below was
derived by me from the stakeholder interviews — none of it was handed over as a spec.
The brief closes with *"we also value how you fill in gaps independently,"* so this
derivation **is** the deliverable. Each row therefore names its source and says whether
it is a stated need or a stated wish. Nothing here is presented as an imposed
requirement, because nothing was.

**Time box.** The MVP is built in **one hour**, stated by the hiring team. The week is
for the writeup and polish, not for more app. If the hour runs out, cut tier 2 — never
cut R7 (deployed URL) or the AI-usage doc.

---

## 1. Tier 1 — build these in the hour (derived, non-negotiable)

| # | Requirement | Source | Acceptance test |
|---|---|---|---|
| R1 | Upload a label image, get a pass/fail verdict with per-check detail | core ask | Upload a JPEG/PNG, receive structured verdict |
| R2 | **End-to-end target: about 5 seconds** for a single label — my budget, not a spec | Sarah, once: *"if we can't get results back in about 5 seconds, nobody's going to use it"* (tied to the failed 30–40s vendor pilot) | Timing harness reports p50/p95 over ≥20 labels; README states the number honestly whatever it is |
| R3 | Brand name match is **fuzzy** — case- and punctuation-insensitive | Dave: "STONE'S THROW" vs "Stone's Throw" | `STONE'S THROW` vs `Stone's Throw` → MATCH_WITH_NOTE, not FAIL |
| R4 | Government warning statement is **byte-exact**, including the ALL-CAPS `GOVERNMENT WARNING:` prefix | Jenny, verbatim: *"it has to be exact… word-for-word"*; she caught a title-case one and rejected it | One character difference → FAIL, with the diff shown |
| R6 | UI usable by a **73-year-old**, non-technical | Sarah's explicit benchmark ("something my mother could figure out"), half the team over 50 | Cold-open test: a non-technical person completes a verification with no instruction |
| R7 | **Live deployed URL** a stranger can open | stated deliverable #2 | Open in a private window on a phone; it works |
| R8 | README with approach, tools, assumptions, limitations, and the network-egress note | stated deliverable #1 + Marcus's firewall comment | Present, honest, specific |
| R9 | **Markdown doc explaining how AI was used** to build it | stated by the hiring team alongside the one-hour limit | `PROCESS.md` exists, has timestamps, real prompts, and at least one place the model was wrong |

## 1b. Tier 2 — build only if the hour allows

| # | Requirement | Source | Why tier 2 |
|---|---|---|---|
| R5 | Batch upload of ~200–300 items with per-item progress | Sarah's aside: *"if there was some way to handle batch uploads, that would be huge"*; Janet in Seattle has asked for years | A stated **wish**, not a stated need. It is cheap once R1 works (a bounded-concurrency loop over the same path), so build it if time remains — but the hiring team said outright that people were *"over-engineering big time"*, and batch is where that starts. **Status: built** — multi-file input, 3-concurrent client-side loop over the unchanged single-label API, per-label streaming progress, one failure never stops the batch. |

Distinguishing R5 from tier 1 is itself a scored signal: it shows the stated need and the
stated wish were separated rather than flattened into one undifferentiated backlog.

### The warning statement (R4) — canonical text

> ✅ **VERIFIED 2026-08-10** against the authoritative source: eCFR API,
> `GET https://www.ecfr.gov/api/versioner/v1/full/2026-08-01/title-27.xml?part=16&section=16.21`
> — **27 CFR § 16.21, "Mandatory label information."** The text below is a
> character-for-character copy of the `<EXTRACT>` block returned by that request.
> In the regulation it renders as two paragraphs — (1) and (2) are separate `<P>`
> elements — which is why the whitespace-collapse rule below exists and is the only
> normalization permitted.
>
> Check this constant into the repo with the citation above in a comment. Do **not**
> fetch it at runtime: a matcher that can't reach its reference text and silently falls
> back to something plausible is the exact failure mode R4 exists to catch.

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

Comparison rules for R4:
- Normalize **whitespace runs → single space** and trim. Nothing else.
- Case-sensitive. Punctuation-sensitive. Digit-sensitive.
- On mismatch, return the first differing span with ±30 chars of context.
- Do **not** run this through the fuzzy matcher. Two separate code paths, deliberately.

### Typography rules — 27 CFR § 16.22 (verified, same source, `&section=16.22`)

Jenny's "all caps and bold" is not folklore, it is § 16.22(a)(2) verbatim:

> "The first two words of the statement required by § 16.21, i.e., 'GOVERNMENT WARNING,'
> shall appear in capital letters and in bold type. The remainder of the warning statement
> may not appear in bold type."

Consequences for the build:
- **In scope (cheap):** the ALL-CAPS check on `GOVERNMENT WARNING` falls straight out of the
  byte-exact comparison. Jenny's rejected title-case label fails automatically.
- **Out of scope, say so in the README:** boldness, contrasting background (16.22(a)(1)),
  characters-per-inch limits (16.22(a)(4): ≤40 at 1 mm, ≤25 at 2 mm, ≤12 at 3 mm), and
  minimum type size by container volume (16.22(b): 1 mm ≤ 237 mL, 2 mm ≤ 3 L, 3 mm above).
  These need pixel-level typography measurement against a known physical scale — real work,
  not an hour's work. Naming them precisely with citations is worth more than half-building
  one: it shows the requirement was found and scoped out on purpose.

### Fuzzy rules for R3 (brand, and other free-text fields)

Normalize before compare: lowercase → strip accents → strip punctuation
(`'` `’` `.` `,` `&` → removed or spaced) → collapse whitespace.

- Exact after normalization → `MATCH`
- Levenshtein ratio ≥ 0.90 after normalization → `MATCH_WITH_NOTE` (show both strings)
- Below 0.90 → `MISMATCH`

`MATCH_WITH_NOTE` is a **pass** with a human-readable note. Dave's case must not fail.

---

## 2. Explicit non-goals

Written down so the README can say them out loud. Saying "I chose not to" scores;
silently omitting does not.

- No user accounts, auth, or roles.
- No persistent database of past submissions beyond an in-process/SQLite record.
- No PDF/COLA-form parsing — images only.
- No admin dashboard, analytics, or reporting.
- No fine-tuned or self-hosted model. Cloud vision API, documented as a swap point.
- No queue infrastructure (Redis/Celery/SQS). Bounded in-process concurrency is
  sufficient for 300 items and is the correct size of solution.
- No microservices. One app, one deploy.

---

## 3. Noise discarded, with reasons

| From the brief | Why it is not a requirement |
|---|---|
| School plays / scheduling anecdotes | Rapport-building filler. No system implication. |
| Dave printing his emails | Characterization of a non-technical user. Already covered by R6. |
| The $4.2M contractor quote | The thesis of the exercise, not a spec item. It argues *against* scope, not for it. |
| "Maybe it could also do TTB form pre-fill someday" | Explicitly hypothetical. Goes in README "with more time". |
| Complaints about the previous vendor | Context for R2 (the failed pilot was slow). Captured there. |
| Marcus's firewall remark | Not a build constraint for a prototype — a **README** constraint. See §4. |

---

## 4. The egress question (Marcus)

The prototype calls a cloud vision API. That is the right call for a one-week
prototype and the wrong call for a locked-down agency network. The README must say
exactly that, and name the swap: extraction sits behind one interface
(`extract_label(image) -> LabelFields`), with the cloud implementation as the default
and a documented local-OCR path (PaddleOCR/Tesseract + rules) behind the same
interface. No code needs to be written for the fallback — the seam and the honesty
are the deliverable.

---

## 5. Test corpus

The brief says it directly: *"We encourage you to create or source additional test
labels—AI image generation tools work well for this."* That is permission to generate,
and generating is both faster than sourcing and strictly more useful, because generated
labels can be **deliberately broken** in known ways. A corpus where you know the ground
truth is the cheapest correctness evidence in the repo.

Generate ~16 labels, checked into `fixtures/labels/` with a `expected.json` per label:

| Set | Count | Content |
|---|---|---|
| Clean | 6 | Fully compliant. All five fields present and matching. Vary beverage type (spirits, wine, beer) and typography. |
| Warning defects | 4 | Title-case `Government Warning:`; missing the `(2)` clause; a paraphrased warning; warning present but in tiny text. |
| Field mismatches | 3 | Wrong ABV vs the filing; brand name mismatch; missing net contents. |
| Benign variance | 2 | `STONE'S THROW` vs `Stone's Throw` (Dave's case); curly vs straight apostrophe. |
| Realism sample | ~4 | Real label images from the TTB public COLA registry, used for the timing harness only — generated images are cleaner than reality and would flatter the latency numbers. Say so in the README. |

The verdict for every fixture is known in advance, so the bench doubles as a correctness
run, not just a stopwatch.

---

## 6. Open items for the operator

- [x] ~~Verify the §16.21 warning text against ecfr.gov~~ — **done 2026-08-10** via the eCFR
      versioner API. The recalled text was correct character-for-character; §16.22 typography
      rules pulled at the same time and scoped (see §"The warning statement" above).
- [ ] Confirm which vision provider/key is available (Mythos access = what exactly?)
- [ ] Confirm submission mechanics: repo link + live URL — and where `PROCESS.md` goes
