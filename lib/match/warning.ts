// 27 CFR § 16.21 "Mandatory label information" — character-for-character copy of
// the <EXTRACT> block returned by the eCFR versioner API, verified 2026-08-10:
// GET https://www.ecfr.gov/api/versioner/v1/full/2026-08-01/title-27.xml?part=16&section=16.21
// Deliberately a checked-in constant: this matcher must never fetch its reference
// text at runtime (see 01-REQUIREMENTS.md §"The warning statement").
export const CANONICAL_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const CONTEXT = 30;

// The ONLY permitted normalization: whitespace runs → single space, trim.
// Case-, punctuation-, and digit-sensitive by design (R4). Not the fuzzy path.
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export type WarningResult = {
  status: "MATCH" | "MISMATCH" | "MISSING";
  diff?: { at: number; expected: string; found: string };
};

export function matchWarning(found: string | null): WarningResult {
  if (found === null || collapseWhitespace(found) === "") return { status: "MISSING" };

  const f = collapseWhitespace(found);
  const e = CANONICAL_WARNING;
  if (f === e) return { status: "MATCH" };

  let at = 0;
  const min = Math.min(e.length, f.length);
  while (at < min && e[at] === f[at]) at++;

  const start = Math.max(0, at - CONTEXT);
  return {
    status: "MISMATCH",
    diff: {
      at,
      expected: e.slice(start, at + CONTEXT),
      found: f.slice(start, at + CONTEXT),
    },
  };
}
