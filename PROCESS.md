# PROCESS — how this was built, with AI, verbatim

Session transcript of the build, 2026-08-13, one working session with Claude Code
(Claude Fable 5). Prompts below are the actual instructions given; timestamps are from
the git log (full log at the bottom). Where the model or the spec was wrong, it says so.

---

## Timeline

### ~22:05 — Scaffold + deploy first (prompt, verbatim)

> "Read 01-REQUIREMENTS.md and 02-ARCHITECTURE.md. That's the spec. Before writing any
> app logic: scaffold a minimal Next.js app and deploy a hello-world to Vercel. I want a
> live URL first. Then stop and tell me the URL."

The agent scaffolded Next.js 15 (App Router + TS) by hand rather than `create-next-app`
(fewer prompts, leaner), built green locally, then hit a real snag: **anonymous Vercel
deploys build locally, and the local build died on a Windows symlink `EPERM`.** Fix was
to log in (`npx vercel login`, interactive — done by me) so the build ran on Vercel's
side. Live URL up at **22:13** (commit `0ae1d0e`). The spec's "a dead link is the only
unrecoverable failure" rule is why this came first.

### 22:14–22:21 — Matchers test-first, then the whole app (commit `edbec92`)

> "go — start the matcher tests" … then mid-turn: "build the app per the spec. Single
> page: upload a label image + fill in the application fields … Two separate matchers:
> byte-exact for the government warning, fuzzy/case-insensitive for the other fields.
> Do not combine them."

The nine-row matcher table from the architecture doc was written as tests **before**
either matcher existed — including trap tests ("case is NOT normalized away in the
warning path") aimed exactly at the shared-smart-matcher failure the spec predicted a
model would generate. Then: `warning.ts` (byte-exact vs the checked-in § 16.21
constant), `brand.ts` (normalize case/accents/punctuation), `extract.ts` (one Claude
vision call, strict JSON schema, hard timeout), `/api/verify` with per-stage timing,
and the single-page UI (18px+ fonts, 44px+ targets, plain-sentence verdicts). 13/13
tests green, deployed.

### 22:22–22:28 — First live test fails; honest errors (commit `3a4ff13`)

First e2e attempt returned a 502 in under a second. The API's generic "try a clearer
photo" message was **masking the real cause: the Anthropic account had zero credits.**
Fixed: billing/auth/timeout errors now surface distinctly. Also added numeric ABV
comparison after reading `fixtures.json` (case #10 requires `40% ≠ 45%` to fail on
parsed numbers, not string distance — the fuzzy ratio for those two strings is 0.89,
uncomfortably close to the pass band). Bench script written to run the whole corpus.

### 22:28–22:35 — The corpus run finds two real bugs (commit `04b6378`)

First full run: 14/16.

- **The spec was wrong (model followed it faithfully): the Levenshtein ≥ 0.90 band.**
  Fixture #12's one-letter misspelling `OLD TOMM DISTILLERY` scores **0.947** against
  `OLD TOM DISTILLERY` — above the band, so a real defect passed with a note. On short
  strings no threshold separates a one-char typo from identity. The band was removed:
  normalization already absorbs every benign variant; anything surviving it is a real
  difference. Deviation documented in the README; unit test pins it.
- **The fixtures were wrong (the app was right):** #12 and #13 both failed on
  `alcoholContent:MISSING`. Viewing the images showed the generator had omitted the ABV
  line from both labels. Per the operating rule "fix the fixture, don't chase the
  code," the ABV line was drawn onto both images and recommitted.
- **The anti-hallucination check passed** (#08, illegible tiny warning): the extractor
  returned honestly garbled OCR — "…should net drink alcoholic bimerages… may canse
  healld probitions…" — instead of supplying the canonical text from memory. The
  byte-exact matcher failed it with a diff at position 0. This is the failure mode that
  would let an illegible label pass, and it didn't happen.

Second run after fixes: **16/16 as expected** (one transient timeout, passed on retry).
The proof-pair held: #05 title-case *warning* FAILS, #13 title-case *brand* PASSES with
note — one unified matcher cannot do both.

One tooling stumble worth recording: the fixture-patching script was first attempted
inline in the shell, got mangled by quoting, and created a stray empty `.png` (no
fixture damage — git confirmed). Rewritten as a script file and run cleanly. The
mistake cost two minutes; the git check is why it cost nothing more.

### 22:36–22:49 — Timeout, README, UI detail (commits `34bab15`, `defd646`)

> "Raise the extract timeout from 8s to 10s. No retry logic — a retry doubles
> worst-case latency and hides variance I need to report honestly."

Timeout raised, no retry. README written from the skeleton with the measured numbers
stated plainly: **p50 6,434 ms / p95 7,685 ms server-side over the corpus — the ~5 s
target is not met on raw fixture PNGs**, with both caveats (bench posts 2 MB PNGs; the
UI path downscales ~10×). Finally, a user-report fix: warning failures were showing
only a ±30-char diff snippet — every failing check now renders full untruncated
expected/found text.

---

## Where the model was wrong (or nearly)

1. **It implemented the spec's Levenshtein band as written**, and the band itself was
   broken. The corpus caught it, not the code review. Lesson: the fixture set with
   known ground truth was the cheapest correctness evidence in the repo, exactly as the
   requirements doc predicted.
2. **The first error handler hid the real failure** ("try a clearer photo" for a
   billing error). Caught on the first live request.
3. **An inline shell script for image patching broke under quoting** and touched the
   filesystem before failing. Recovered via git; rewritten as a file.

## What was never delegated

The § 16.21 warning constant (checked in verbatim, never retyped, never fetched at
runtime), the decision to cut batch (tier 2), the decision to deviate from the 0.90
band, and every deploy.

---

## Full git log

```
defd646  2026-08-13 22:49:02  Show full failure detail for every failing check (no truncation)
34bab15  2026-08-13 22:41:32  Raise extract timeout to 10s (no retry), write README
04b6378  2026-08-13 22:34:56  Drop Levenshtein pass-band (fixture 12), patch missing ABV line into fixtures 12/13
3a4ff13  2026-08-13 22:28:01  Numeric ABV comparison, honest billing/auth errors, corpus bench script
edbec92  2026-08-13 22:21:08  Matchers (test-first), vision extraction, /api/verify, single-label UI
0ae1d0e  2026-08-13 22:13:53  Scaffold minimal Next.js app (hello world)
```

Per-commit file stats: `git log --stat`. Live URL:
https://ttb-label-check-ruddy.vercel.app
