// Verdict assembly. Brand/class/ABV/net contents go through the fuzzy path;
// the government warning goes through the byte-exact path. Never combined.
import type { CheckResult, LabelFields, Verdict } from "../types";
import { matchBrand } from "./brand";
import { matchWarning, CANONICAL_WARNING } from "./warning";

export type ExpectedFields = {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
};

// ABV compares on the parsed percentage number, not string distance — a 40% vs
// 45% label must fail even though the strings are only two characters apart.
function matchAlcohol(expected: string, found: string | null): ReturnType<typeof matchBrand> {
  if (found === null || found.trim() === "") return { status: "MISSING" };
  const num = (s: string) => {
    const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
    return m ? parseFloat(m[1]) : null;
  };
  const e = num(expected);
  const f = num(found);
  if (e !== null && f !== null) {
    if (e !== f) return { status: "MISMATCH" };
    return matchBrand(expected, found); // numbers agree; fuzzy pass surfaces formatting notes
  }
  return matchBrand(expected, found);
}

export function assembleVerdict(
  expected: ExpectedFields,
  found: LabelFields,
  timing: Verdict["timing"],
): Verdict {
  const checks: CheckResult[] = [];

  const fuzzyFields: (keyof ExpectedFields)[] = [
    "brandName",
    "classType",
    "alcoholContent",
    "netContents",
  ];
  for (const field of fuzzyFields) {
    const r =
      field === "alcoholContent"
        ? matchAlcohol(expected[field], found[field])
        : matchBrand(expected[field], found[field]);
    checks.push({
      field,
      status: r.status,
      expected: expected[field],
      found: found[field],
      note: r.note,
    });
  }

  const w = matchWarning(found.warningStatement);
  checks.push({
    field: "warningStatement",
    status: w.status,
    expected: CANONICAL_WARNING,
    found: found.warningStatement,
    diff: w.diff,
  });

  const overall = checks.some((c) => c.status === "MISMATCH" || c.status === "MISSING")
    ? "FAIL"
    : checks.some((c) => c.status === "MATCH_WITH_NOTE")
      ? "PASS_WITH_NOTES"
      : "PASS";

  return { overall, checks, timing };
}
