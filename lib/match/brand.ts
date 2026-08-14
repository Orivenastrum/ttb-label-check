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

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

export function matchBrand(expected: string, found: string | null): FuzzyResult {
  if (found === null || found.trim() === "") return { status: "MISSING" };

  const e = normalizeKeepCase(expected);
  const f = normalizeKeepCase(found);

  if (e === f) return { status: "MATCH" };
  if (e.toLowerCase() === f.toLowerCase()) {
    return { status: "MATCH_WITH_NOTE", note: `Capitalization differs: expected "${expected}", label shows "${found}".` };
  }

  const el = e.toLowerCase(), fl = f.toLowerCase();
  const maxLen = Math.max(el.length, fl.length);
  const ratio = maxLen === 0 ? 1 : 1 - levenshtein(el, fl) / maxLen;
  if (ratio >= 0.9) {
    return { status: "MATCH_WITH_NOTE", note: `Close but not identical: expected "${expected}", label shows "${found}".` };
  }
  return { status: "MISMATCH" };
}

