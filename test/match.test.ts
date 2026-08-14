import { describe, it, expect } from "vitest";
import { matchBrand } from "../lib/match/brand";
import { matchWarning, CANONICAL_WARNING } from "../lib/match/warning";

// The nine-row table from 02-ARCHITECTURE.md §5. These are written before the
// matchers and are the contract: the warning path must NOT share normalization
// with the brand path.

describe("brand matcher (R3, fuzzy)", () => {
  it("case difference → MATCH_WITH_NOTE (Dave's case must not fail)", () => {
    const r = matchBrand("Stone's Throw", "STONE'S THROW");
    expect(r.status).toBe("MATCH_WITH_NOTE");
    expect(r.note).toBeTruthy();
  });

  it("curly vs straight apostrophe → MATCH", () => {
    expect(matchBrand("Stone's Throw", "Stone’s Throw").status).toBe("MATCH");
  });

  it("missing apostrophe → MATCH", () => {
    expect(matchBrand("Stone's Throw", "Stones Throw").status).toBe("MATCH");
  });

  it("one inserted character → MISMATCH (fixture #12: OLD TOMM must reject)", () => {
    expect(matchBrand("OLD TOM DISTILLERY", "OLD TOMM DISTILLERY").status).toBe("MISMATCH");
  });

  it("extra word → MISMATCH", () => {
    expect(matchBrand("Stone's Throw", "Stone's Throw Winery").status).toBe("MISMATCH");
  });

  it("absent → MISSING", () => {
    expect(matchBrand("Stone's Throw", null).status).toBe("MISSING");
  });
});

describe("warning matcher (R4, byte-exact after whitespace collapse)", () => {
  it("canonical text → MATCH", () => {
    expect(matchWarning(CANONICAL_WARNING).status).toBe("MATCH");
  });

  it("title-case prefix → MISMATCH with diff at the start", () => {
    const r = matchWarning(CANONICAL_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:"));
    expect(r.status).toBe("MISMATCH");
    // first differing char is the 'o' in "Government"
    expect(r.diff?.at).toBe(1);
    expect(r.diff?.expected).toContain("GOVERNMENT");
    expect(r.diff?.found).toContain("Government");
  });

  it("internal double space → MATCH (whitespace collapse is the only normalization)", () => {
    expect(matchWarning(CANONICAL_WARNING.replace("(2) Consumption", "(2)  Consumption")).status).toBe("MATCH");
  });

  it("newline inside → MATCH (a label line-wraps; runs collapse to one space)", () => {
    expect(matchWarning(CANONICAL_WARNING.replace(" (2) ", "\n(2) ")).status).toBe("MATCH");
  });

  it("missing the (2) clause → MISMATCH with diff", () => {
    const idx = CANONICAL_WARNING.indexOf(" (2)");
    const r = matchWarning(CANONICAL_WARNING.slice(0, idx));
    expect(r.status).toBe("MISMATCH");
    expect(r.diff).toBeDefined();
    expect(r.diff!.at).toBe(idx);
  });

  it("absent → MISSING", () => {
    expect(matchWarning(null).status).toBe("MISSING");
  });

  it("case is NOT normalized away (the shared-smart-matcher trap)", () => {
    expect(matchWarning(CANONICAL_WARNING.toLowerCase()).status).toBe("MISMATCH");
  });

  it("punctuation is NOT normalized away", () => {
    expect(matchWarning(CANONICAL_WARNING.replace("GOVERNMENT WARNING:", "GOVERNMENT WARNING")).status).toBe("MISMATCH");
  });
});
