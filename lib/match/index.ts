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
    const r = matchBrand(expected[field], found[field]);
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
