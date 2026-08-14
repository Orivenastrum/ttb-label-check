# README skeleton (this becomes the project's README.md)

Fill the bracketed parts. Keep the section order — a grader skimming for the live URL
and the honesty sections should hit them in the first screen and the last.

---

# Alcohol Label Verification

**Live: [https://____.vercel.app](https://____.vercel.app)**
Upload a label image, get a compliance verdict in under five seconds.

![screenshot](docs/screenshot.png)

## What it does

Given a label image and the expected filing values, it extracts the label's text and
checks five fields: brand name, class/type, alcohol content, net contents, and the
mandatory Surgeon General warning statement. It returns a pass/fail verdict with a
plain-language reason for every check, plus timing for each stage.

[If batch shipped:] Batch mode takes 200–300 images at once and reports per-item results
as they finish. [If it did not: delete this line and say so under Limitations — an
honest cut beats a half-built feature, and the brief's authors said outright that
submissions were over-engineered.]

## Quick start

```bash
git clone ___ && cd ___
cp .env.example .env.local     # add your vision API key
npm install
npm run dev                    # http://localhost:3000
npm test                       # matcher tests
npm run bench                  # latency harness over fixtures/labels
```

## Performance

Measured over [N] labels ([N] generated fixtures + [N] real labels from the TTB public
COLA registry), [date], from [location]. The real-label subset is reported separately
because generated images are cleaner than photographs and would flatter the numbers:

| | p50 | p95 | max |
|---|---|---|---|
| End-to-end | __ ms | __ ms | __ ms |
| — extraction | __ ms | __ ms | __ ms |
| — matching | __ ms | __ ms | __ ms |

The brief specifies no latency requirement; the five-second target is mine, derived from
the Compliance Division's account of a prior vendor pilot that took 30–40 seconds per
label and was abandoned. [State plainly whether the target is met. If it is not, say so
and give the number — a missed target reported honestly costs far less than a number
that cannot be reproduced.] The dominant cost is the single vision call;
client-side image downscaling before upload was the largest single improvement
([before] → [after]).

## How verification works

**Brand name and other free-text fields — fuzzy.** Compared after normalizing case,
accents, and punctuation. `STONE'S THROW` and `Stone's Throw` match, with a note that
capitalization differs. This is intentional: a case difference is a data-entry
artifact, not a compliance failure.

**Warning statement — exact.** Compared character-for-character (whitespace runs
collapsed) against the mandated text, including the all-caps `GOVERNMENT WARNING:`
prefix. Any difference fails and the report shows exactly where. The regulation
specifies the words; approximate is not compliant.

These are two separate code paths on purpose. [link to lib/match/]

## Assumptions

- [Images only — JPEG/PNG. No PDFs or multi-page filings.]
- [Expected values are supplied with the upload; integration with the filing system is out of scope.]
- [English-language labels.]
- [One label per image, front label. Wrap-around/back labels are not composited.]
- [...]

## Network and deployment constraints

This prototype calls a hosted vision API for text extraction. In a network-restricted
agency environment that egress may not be permitted. Extraction is isolated behind a
single interface (`lib/extract.ts`); a self-hosted OCR implementation (PaddleOCR or
Tesseract plus the same field-parsing rules) drops in behind it without touching the
matching, API, or UI layers. The matching logic — where the compliance rules actually
live — runs entirely locally and makes no network calls.

Deployed on Vercel for speed of demonstration. The app is a standard Node service with
one outbound dependency; a container port to Azure Government or AWS GovCloud is
mechanical, not architectural.

## Limitations (what I would not claim this does)

- [Extraction accuracy on damaged, angled, or low-contrast photographs is untested at scale.]
- [Handwritten or highly stylized script typefaces degrade extraction.]
- [No human-in-the-loop correction step — a wrong extraction currently produces a wrong verdict with no way to override.]
- [Batch has no persistence: a browser refresh mid-run loses progress.]
- [...]

## With more time

- [Human review queue: flag low-confidence extractions instead of auto-failing.]
- [Local OCR path implemented, not just seamed.]
- [Confidence scores from extraction surfaced per field.]
- [More of the 27 CFR mandatory-statement checks beyond the four implemented.]

## Choices I made and why

- **One process, no queue.** 300 images at bounded concurrency finish in ~90 seconds.
  A message broker would add operational surface for no user-visible gain.
- **No database.** Nothing in the requirements needs history.
- **[N] dependencies.** [...]

## How I built this

The MVP was built in one hour with AI assistance. The full account — what I delegated,
what I refused to delegate, and the places the model produced confident wrong code plus
the measurements that caught it — is in **[PROCESS.md](PROCESS.md)**. The requirements
contract I derived from the stakeholder interviews before writing any code is in
[REQUIREMENTS.md](REQUIREMENTS.md).
