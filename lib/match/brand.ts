// Fuzzy matcher for brand and other free-text fields (R3). Never used for the
// government warning — that is the separate byte-exact path in warning.ts.

export type FuzzyResult = {
  status: "MATCH" | "MATCH_WITH_NOTE" | "MISMATCH" | "MISSING";
  note?: string;
};

// Strip accents and punctuation, collapse whitespace. Case is handled separately
// so a pure case difference can surface as MATCH_WITH_NOTE rather than MATCH.
function normalizeKeepCase(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’.,&]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchBrand(expected: string, found: string | null): FuzzyResult {
  if (found === null || found.trim() === "") return { status: "MISSING" };

  const e = normalizeKeepCase(expected);
  const f = normalizeKeepCase(found);

  if (e === f) return { status: "MATCH" };
  if (e.toLowerCase() === f.toLowerCase()) {
    return { status: "MATCH_WITH_NOTE", note: `Capitalization differs: expected "${expected}", label shows "${found}".` };
  }

  // No similarity band: normalization already absorbs every benign variant
  // (case, apostrophes, accents, punctuation). A remaining letter difference
  // is a real misspelling — "OLD TOMM" must reject (fixture #12), and any
  // Levenshtein threshold loose enough to allow it also allows real defects.
  return { status: "MISMATCH" };
}

