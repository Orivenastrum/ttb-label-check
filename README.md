# Alcohol Label Verification

**Live: [https://ttb-label-check-ruddy.vercel.app](https://ttb-label-check-ruddy.vercel.app)**
Upload a label image, get a per-field compliance verdict with timing attached.

## What it does

Given a label image and the expected filing values, it extracts the label's text with a
single vision-model call and checks five fields: brand name, class/type, alcohol
content, net contents, and the mandatory Surgeon General warning statement. It returns
a pass/fail verdict with a plain-language reason for every check, plus per-stage timing
(upload / extract / match / total) in every response.

Batch mode did **not** ship - deliberately. It was tier 2 in my requirements derivation
(a stated wish, not a stated need), and the brief's authors called out over-engineering
by name. The single-label path is a pure function pipeline; batch is a bounded-concurrency
loop over it and is described, not built. See Limitations.

## Quick start

```bash
git clone <repo> && cd ttb-label-check
# set ANTHROPIC_API_KEY in your environment (or Vercel project env)
npm install
npm run dev                    # http://localhost:3000
npm test                       # matcher test table (14 tests)
node scripts/bench.mjs <url>   # corpus run + latency over test-labels/
```

## Performance - measured, honest

Measured 2026-08-13 over the 16-label fixture corpus in `test-labels/`, posted to the
production deployment (Vercel iad1 + Anthropic API) from a residential connection:

| | p50 | p95 | max |
|---|---|---|---|
| Server-side end-to-end | 6,434 ms | 7,685 ms | 8,601 ms |
| - extraction (the vision call) | ~6,400 ms | ~7,600 ms | - |
| - matching (pure string ops) | <10 ms | <10 ms | <10 ms |

**The ~5-second target is not met on this corpus, and the target was never a spec** - I
derived it from a stakeholder's comment about a failed 30-40s vendor pilot. Two honest
caveats in both directions: (1) the bench posts the raw ~2 MB fixture PNGs, while the
browser UI downscales to 1600 px JPEG (~10x smaller) before upload, so the real UI path
is faster than the bench numbers; (2) roughly 1 call in 15 exceeded the old 8 s timeout.
The hard timeout is now **10 seconds** with an explicit error - no retry logic, because a
retry would double worst-case latency and hide exactly the variance reported here.
Extraction is >99% of the cost; matching is effectively free.

## How verification works - two matchers, deliberately separate

**Brand name and other free-text fields - fuzzy** (`lib/match/brand.ts`). Compared after
normalizing case, accents, apostrophes, and punctuation. `STONE'S THROW` vs
`Stone's Throw` passes with a note that capitalization differs: a case difference is a
data-entry artifact, not a compliance failure. Alcohol content additionally compares the
parsed percentage numerically, so `40%` vs `45%` fails on the numbers regardless of
string similarity.

**Warning statement - byte-exact** (`lib/match/warning.ts`). Compared
character-for-character against the 27 CFR § 16.21 text (verified against the eCFR API
and checked in as a constant - never fetched at runtime). The only normalization is
whitespace-runs -> single space. Any other difference fails, and the report shows the
first differing span with context.

**The evidence the paths are separate is the fixture pair #05/#13.** Fixture #05 (the
warning rendered title-case as `Government Warning:`) **fails**, with a diff at the
second character - the exact matcher is case-sensitive. Fixture #13 (the brand rendered
title-case as `Old Tom Distillery` against a filing of `OLD TOM DISTILLERY`) **passes
with a note** - the fuzzy matcher is case-insensitive. One unified "smart" matcher
cannot do both; these two do, and the corpus proves it on every run.

### A deliberate deviation from my own spec: the Levenshtein band is gone

My requirements doc specified fuzzy matching as "Levenshtein ratio >= 0.90 after
normalization -> pass with note." Fixture #12 showed that rule is mathematically broken
for short strings: `OLD TOMM DISTILLERY` vs `OLD TOM DISTILLERY` - a one-letter
misspelling that must fail - scores **0.947**, comfortably above the band. On strings
this short, no threshold can separate a one-character typo from identity. Meanwhile
normalization already absorbs every benign variant the band existed for (case,
apostrophes curly and straight, accents, punctuation). So the rule is now simpler and
strictly better: **equal after normalization -> pass; anything else -> fail.** A unit test
pins the OLD TOMM case.

### The anti-hallucination finding (fixture #08)

Fixture #08 renders the warning in deliberately illegible tiny type. The risk with an
LLM extractor is that it *knows* what the warning is supposed to say and supplies the
canonical text from memory instead of reading the pixels - which would let an illegible
label pass. That did not happen. The extractor transcribed the unreadable pixels
honestly, returning garbled OCR - "...should net drink alcoholic bimerages... may canse
healld probitions..." - which the byte-exact matcher then failed with a diff at position 0.
The extraction prompt's "transcribe exactly as printed, do not correct or normalize"
instruction is load-bearing; this fixture is the regression test for it.

### Fixture regeneration note (#12, #13)

Fixtures #12 and #13 were regenerated during testing: the image generator had omitted
the alcohol-content line from both, so every run failed them on `alcoholContent:MISSING`
- masking the brand-matching signal those two fixtures exist to test. The ABV line was
drawn onto the label area and the images recommitted. The fix was to the fixtures, not
the code: the app had read the images correctly.

## Assumptions

- Images only - JPEG/PNG/WebP. No PDFs or multi-page filings.
- Expected values are typed in with the upload; filing-system integration is out of scope.
- English-language labels, one label per image, front label.

## Network and deployment constraints

This prototype calls a hosted vision API (Anthropic) for text extraction. In a
network-restricted agency environment that egress may not be permitted. Extraction is
isolated behind a single interface (`lib/extract.ts` - the only file that knows a vendor
exists); a self-hosted OCR implementation (PaddleOCR or Tesseract plus the same
field-parsing rules) drops in behind it without touching the matching, API, or UI
layers. The matching logic - where the compliance rules actually live - runs entirely
locally and makes no network calls.

Deployed on Vercel for speed of demonstration. The app is a standard Node service with
one outbound dependency; a container port to Azure Government or AWS GovCloud is
mechanical, not architectural.

## Limitations (what I would not claim this does)

- **Batch upload is out of scope (tier 2, cut on purpose).** The design is documented
  (bounded concurrency of 8 over the single-label path, SSE per-item progress); it was
  not built, because it was a stated wish rather than a stated need and the correct
  size of this solution is small.
- **27 CFR § 16.22 typography checks are named and declined:** boldness of
  `GOVERNMENT WARNING` (16.22(a)(2)), contrasting background (16.22(a)(1)),
  characters-per-inch limits (16.22(a)(4): <=40 at 1 mm, <=25 at 2 mm, <=12 at 3 mm), and
  minimum type size by container volume (16.22(b): 1 mm <= 237 mL, 2 mm <= 3 L, 3 mm
  above). These require pixel-level physical measurement against a known scale - real
  work, not in scope. The ALL-CAPS requirement of 16.22(a)(2) *is* enforced, free, by
  the byte-exact comparison.
- Extraction accuracy on damaged, angled, or low-contrast photographs is untested at
  scale (the one angled fixture, #16, happened to pass; that is one data point).
- No human-in-the-loop correction - a wrong extraction produces a wrong verdict with no
  override.
- Roughly 1 extraction in 15 on this corpus exceeded 8 s; the timeout is 10 s and a
  timeout surfaces as an explicit error, not a hang or a retry.

## With more time

- Human review queue: flag low-confidence extractions instead of auto-failing.
- Local OCR path implemented behind `lib/extract.ts`, not just seamed.
- Per-field confidence scores surfaced in the UI.
- Batch mode as designed above.

## Choices I made and why

- **One process, no queue, no database.** Nothing in the requirements needs history or
  a broker.
- **One model call per label**, structured JSON output (no parse-retry loop), capped
  output tokens, thinking disabled - all latency decisions.
- **4 runtime dependencies** (next, react, react-dom, @anthropic-ai/sdk).

## How I built this

Built with AI assistance under a one-hour MVP clock; the account of what was delegated,
what was not, and where the model was wrong is in [PROCESS.md](PROCESS.md). The
requirements contract derived from the stakeholder interviews is in
[01-REQUIREMENTS.md](01-REQUIREMENTS.md); the architecture in
[02-ARCHITECTURE.md](02-ARCHITECTURE.md).
