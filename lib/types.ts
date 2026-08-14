// The five fields come verbatim from the brief's "Example Distilled Spirits
// Label Fields" block. That list is the schema - no sixth field.
export type LabelFields = {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null; // raw text, e.g. "45% Alc./Vol. (90 Proof)"
  netContents: string | null;
  warningStatement: string | null; // raw, unnormalized
  rawText: string; // full OCR dump, kept for the diff view
};

export type CheckStatus = "MATCH" | "MATCH_WITH_NOTE" | "MISMATCH" | "MISSING";

export type CheckResult = {
  field: keyof LabelFields;
  status: CheckStatus;
  expected: string | null;
  found: string | null;
  note?: string;
  diff?: { at: number; expected: string; found: string }; // R4 only
};

export type Verdict = {
  overall: "PASS" | "PASS_WITH_NOTES" | "FAIL";
  checks: CheckResult[];
  timing: { upload: number; extract: number; match: number; total: number };
};
