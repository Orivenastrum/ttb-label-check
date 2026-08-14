# PROCESS - how AI was used to build this

Built with Claude Code. Two models, two roles: **Claude Fable 5** is the coding agent
that wrote this codebase; **Claude Opus 5** is the vision model the deployed app calls
for label extraction (`lib/extract.ts`).

## The short version

- **Delegated to the model:** all implementation - matchers, extraction call, API
  route, UI, bench script - plus writing the trap tests for its own likely failure
  mode, and debugging its own bugs against the fixture corpus.
- **Decided by me (carried in from the spec, not volunteered by the model):** the
  two-matcher split (byte-exact warning / fuzzy everything else), deploy-before-code,
  tests-before-matchers, the checked-in § 16.21 constant, the 10s hard timeout with
  **no retry** (a retry hides the variance I report), and cutting batch.
- **Caught by the fixture corpus, not by reading the code:** the spec's Levenshtein
  band passing a real misspelling, and two fixture images missing their ABV line.
- **Caught on the first live request:** the model's error handler masking a billing
  failure behind "try a clearer photo."
- **Cut:** retry logic, § 16.22 typography checks (named and declined in the README),
  auth, database.
- **Batch:** runs as a client-side bounded-concurrency pool (3 in flight) over the
  unchanged single-label API - no queue, no server-side batch endpoint. The tier-2
  derivation and status live in the R5 row of `01-REQUIREMENTS.md`.

**Provenance of "the spec":** `01-REQUIREMENTS.md` and `02-ARCHITECTURE.md` were
written before the build, also with AI assistance - the requirements derivation from
the stakeholder interviews and the § 16.21 verification against the eCFR API happened
there. When this doc says a decision was "carried in from the spec," that means
decided in that earlier AI-assisted prep, not invented by the coding agent during the
build.

Detail below for anyone who wants it.

---

## How the build ran

### Scaffold + deploy first (my prompt, verbatim)

> "Read 01-REQUIREMENTS.md and 02-ARCHITECTURE.md. That's the spec. Before writing any
> app logic: scaffold a minimal Next.js app and deploy a hello-world to Vercel. I want a
> live URL first. Then stop and tell me the URL."

Deploy-first was a spec rule ("a dead link is the only unrecoverable failure"), not the
model's idea. One real snag: anonymous Vercel deploys build locally, and the local
build died on a Windows symlink `EPERM`; fixed by logging in (interactive, done by me)
so builds run remotely.

### Matchers test-first, then the whole app

> "go - start the matcher tests" ... then: "build the app per the spec. Single
> page: upload a label image + fill in the application fields ... Two separate matchers:
> byte-exact for the government warning, fuzzy/case-insensitive for the other fields.
> Do not combine them."

The two-path design and the write-tests-first order came from the spec and my prompt.
The model's contribution was faithful execution plus tests aimed at its own predicted
failure mode ("case is NOT normalized away in the warning path" - the
shared-smart-matcher trap the architecture doc warned about). It also implemented:
`warning.ts`, `brand.ts`, `extract.ts` (one vision call, strict JSON schema, hard
timeout, an explicit "transcribe exactly as printed, do not correct" instruction),
`/api/verify` with per-stage timing, and the single-page UI.

The interface targets a non-technical agent audience (the brief specifies "clean,
obvious, no hunting for buttons" and a 73-year-old benchmark; half the review team is
over 50). Verdicts render as words - PASS / PASS WITH NOTES / FAIL / ERROR - with
color as reinforcement rather than the signal, so a colorblind agent reads the same
result. Field mismatches show the application value against the label value side by
side in plain language. Progress is announced via an aria-live region because
extraction takes 5-10 seconds and a silent wait reads as a hang. Styling stays
inline, with no added dependencies or design system.

### First live test; honest errors; numeric ABV

First e2e attempt: 502 in under a second. **Model error #1:** its catch block returned
"try a clearer photo" for what was actually a zero-credits billing error on the
Anthropic account. Fixed to surface billing/auth/timeout distinctly. After reading
`fixtures.json`, the model proposed numeric ABV comparison (case #10 requires
`40% != 45%` to fail on parsed numbers; the string-similarity ratio for those two
strings is 0.89, uncomfortably close to the pass band) - a good catch, to its credit.

### The corpus finds two real bugs

First full run: 14/16.

- **Model error #2 (and a spec error): the Levenshtein >= 0.90 band.** The spec stated
  the band; the model implemented it as written and **did not flag that it cannot
  work**: fixture #12's one-letter misspelling `OLD TOMM DISTILLERY` scores 0.947 -
  above the band - so a real defect passed with a note. On short strings no threshold
  separates a one-char typo from identity. The fixture corpus caught it (I had flagged
  #12-vs-#13 as the threshold check); the band was removed and the deviation is
  documented in the README with a pinning unit test.
- **The fixtures were wrong, the app was right:** #12/#13 both failed on
  `alcoholContent:MISSING`; viewing the images showed the generator had omitted the
  ABV line from both. Per my instruction ("fix the fixture, don't chase the code"),
  the ABV line was drawn onto both images and recommitted.
- **The anti-hallucination check passed** (#08, illegible tiny warning): the extractor
  returned honestly garbled OCR - "...should net drink alcoholic bimerages... may canse
  healld probitions..." - instead of supplying the canonical text from memory, and the
  byte-exact matcher failed it with a diff at position 0. That is the failure mode
  that would let an illegible label pass, and it didn't happen.

Second run: **16/16 as expected**. The proof-pair held: #05 title-case *warning*
FAILS, #13 title-case *brand* PASSES with note - one unified matcher cannot do both.

### Timeout, README, UI detail

> "Raise the extract timeout from 8s to 10s. No retry logic - a retry doubles
> worst-case latency and hides variance I need to report honestly."

My call, implemented as stated. README written with measured numbers stated plainly
(p50 6,434 ms / p95 7,685 ms over the corpus; the ~5 s figure was my derived budget,
not a spec). Final fix from my report: failing checks now show full untruncated
expected/found text instead of a +/-30-char snippet.

---

## Model benchmark

In response to the latency figure, the extraction model was made configurable
(`EXTRACT_MODEL` env var, defaulting to `claude-opus-5`) and the full 16-fixture
corpus was run back-to-back against Opus 5, Sonnet 5, and Haiku 4.5 on the same
machine. All three scored 16/16 and the faster models cut p50 by ~1.3 s and ~2.9 s
respectively - but both faster models passed fixture #08 (the deliberately illegible
warning) by supplying the canonical 27 CFR § 16.21 text from memory instead of
transcribing the unreadable pixels, the exact failure mode the fixture exists to
catch. Opus 5, which transcribed the garble honestly, stays as the production default.
Full table and the verbatim transcriptions are in the README's performance section.

---

Live URL: https://ttb-label-check-ruddy.vercel.app
