"use client";

import { useRef, useState } from "react";

type CheckResult = {
  field: string;
  status: "MATCH" | "MATCH_WITH_NOTE" | "MISMATCH" | "MISSING";
  expected: string | null;
  found: string | null;
  note?: string;
  diff?: { at: number; expected: string; found: string };
};

type Verdict = {
  overall: "PASS" | "PASS_WITH_NOTES" | "FAIL";
  checks: CheckResult[];
  timing: { upload: number; extract: number; match: number; total: number };
};

type LabelResult = {
  name: string;
  state: "waiting" | "checking" | "done" | "error";
  verdict?: Verdict;
  error?: string;
};

const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand name",
  classType: "Class / type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  warningStatement: "Government warning statement",
};

function plainReason(c: CheckResult): string {
  const label = FIELD_LABELS[c.field] ?? c.field;
  switch (c.status) {
    case "MATCH":
      return `${label} matches the application.`;
    case "MATCH_WITH_NOTE":
      return c.note ?? `${label} matches, with a small difference worth noting.`;
    case "MISSING":
      return `${label} could not be found on the label.`;
    case "MISMATCH":
      if (c.field === "warningStatement") {
        return "The warning statement does not match the required wording. The full comparison is shown below.";
      }
      return `${label} on the label does not match the application. The details are shown below.`;
  }
}

// Full detail for any failing check - nothing truncated.
function FailureDetail({ c }: { c: CheckResult }) {
  if (c.status !== "MISMATCH" && c.status !== "MISSING") return null;
  const box: React.CSSProperties = {
    background: "#f7f7f7",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: 16,
  };
  return (
    <div style={{ marginTop: 4, width: "100%" }}>
      <div style={box}>
        <strong>What the application requires:</strong>
        <br />
        {c.expected ?? "(nothing provided)"}
      </div>
      <div style={box}>
        <strong>What the label shows:</strong>
        <br />
        {c.status === "MISSING" || c.found === null || c.found.trim() === ""
          ? "(nothing found on the label)"
          : c.found}
      </div>
      {c.diff && (
        <div style={{ ...box, background: "#fff8e1" }}>
          <strong>Where they first differ</strong> (character {c.diff.at + 1}):
          <br />
          Required: "...{c.diff.expected}..."
          <br />
          On label: "...{c.diff.found}..."
        </div>
      )}
    </div>
  );
}

const STATUS_ICON = { MATCH: "✅", MATCH_WITH_NOTE: "🟡", MISMATCH: "❌", MISSING: "❌" };

const OVERALL = {
  PASS: { text: "✅ This label passes.", bg: "#e8f5e9" },
  PASS_WITH_NOTES: { text: "🟡 This label passes, with notes.", bg: "#fff8e1" },
  FAIL: { text: "❌ This label does not pass.", bg: "#fdecea" },
};

// The per-check list, shared by the single-label view and each batch row.
function ChecksView({ verdict }: { verdict: Verdict }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {verdict.checks.map((c) => (
        <li
          key={c.field}
          style={{ padding: "12px 0", borderBottom: "1px solid #ddd", display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <span aria-hidden style={{ fontSize: 22 }}>{STATUS_ICON[c.status]}</span>
          <span style={{ flex: 1, minWidth: 200 }}>
            <strong>{FIELD_LABELS[c.field] ?? c.field}.</strong> {plainReason(c)}
            <FailureDetail c={c} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Resize client-side to max 1600px long edge, JPEG q0.8 - the biggest latency win.
async function resizeImage(file: File): Promise<{ base64: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

const inputStyle: React.CSSProperties = {
  fontSize: 18,
  padding: "12px 14px",
  minHeight: 44,
  width: "100%",
  boxSizing: "border-box",
  border: "2px solid #999",
  borderRadius: 8,
};

const CONCURRENCY = 3;

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState({ brandName: "", classType: "", alcoholContent: "", netContents: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LabelResult[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  function onFiles(list: FileList | null) {
    const f = list ? Array.from(list) : [];
    setFiles(f);
    setResults([]);
    setError(null);
    setPreview(f.length === 1 ? URL.createObjectURL(f[0]) : null);
  }

  async function checkOne(file: File): Promise<Verdict> {
    const start = Date.now();
    const { base64, mediaType } = await resizeImage(file);
    const uploadMs = Date.now() - start;
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mediaType, expected: fields }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    (data as Verdict).timing.upload = uploadMs;
    return data as Verdict;
  }

  async function submit() {
    if (files.length === 0) {
      setError("Please choose at least one label photo first.");
      return;
    }
    setBusy(true);
    setError(null);
    const initial: LabelResult[] = files.map((f) => ({ name: f.name, state: "waiting" }));
    setResults(initial);

    // Bounded pool: at most CONCURRENCY labels in flight. One failure never
    // stops the batch - that row records its error and the pool moves on.
    let next = 0;
    const worker = async () => {
      while (true) {
        const i = next++;
        if (i >= files.length) return;
        setResults((r) => r.map((x, j) => (j === i ? { ...x, state: "checking" } : x)));
        try {
          const verdict = await checkOne(files[i]);
          setResults((r) => r.map((x, j) => (j === i ? { ...x, state: "done", verdict } : x)));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Something went wrong.";
          setResults((r) => r.map((x, j) => (j === i ? { ...x, state: "error", error: msg } : x)));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    setBusy(false);
  }

  const doneCount = results.filter((r) => r.state === "done" || r.state === "error").length;
  const single = files.length === 1;
  const singleResult = single && results[0]?.state === "done" ? results[0] : null;
  const singleError = single && results[0]?.state === "error" ? results[0].error : null;

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 28 }}>Label Verification</h1>
      <p>
        Upload one label photo, or several at once. Type in what the application says,
        press the big button, and you will get a clear pass or fail for each label.
      </p>

      <section style={{ margin: "24px 0" }}>
        <h2 style={{ fontSize: 22 }}>1. The label photos</h2>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          style={{ ...inputStyle, cursor: "pointer", background: "#f2f2f2", textAlign: "left" }}
        >
          {files.length === 0
            ? "📷 Choose one or more label photos..."
            : files.length === 1
              ? `Photo chosen: ${files[0].name}`
              : `${files.length} photos chosen`}
        </button>
        {preview && (
          <img
            src={preview}
            alt="The label photo you chose"
            style={{ maxWidth: "100%", maxHeight: 300, marginTop: 12, borderRadius: 8 }}
          />
        )}
      </section>

      <section style={{ margin: "24px 0" }}>
        <h2 style={{ fontSize: 22 }}>2. What the application says</h2>
        {files.length > 1 && (
          <p style={{ color: "#555", fontSize: 16 }}>
            The values you enter here are checked against every uploaded label. If your
            photos are different products, check them one at a time instead.
          </p>
        )}
        {(
          [
            ["brandName", "Brand name", "e.g. Old Tom Distillery"],
            ["classType", "Class / type", "e.g. Kentucky Straight Bourbon Whiskey"],
            ["alcoholContent", "Alcohol content", "e.g. 45% Alc./Vol. (90 Proof)"],
            ["netContents", "Net contents", "e.g. 750 mL"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} style={{ display: "block", marginBottom: 14 }}>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>{label}</span>
            <input
              style={inputStyle}
              placeholder={placeholder}
              value={fields[key]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            />
          </label>
        ))}
      </section>

      <button
        onClick={submit}
        disabled={busy}
        style={{
          fontSize: 22,
          fontWeight: 700,
          padding: "16px 24px",
          minHeight: 56,
          width: "100%",
          borderRadius: 10,
          border: "none",
          background: busy ? "#9ec5e8" : "#1a6fb4",
          color: "white",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy
          ? files.length > 1
            ? `Checking labels... ${doneCount} of ${files.length} done`
            : "Checking the label... (a few seconds)"
          : files.length > 1
            ? `Check these ${files.length} labels`
            : "Check this label"}
      </button>

      {error && (
        <p style={{ marginTop: 16, padding: 14, background: "#fdecea", borderRadius: 8, color: "#8a1f1f" }}>
          {error}
        </p>
      )}

      {/* Single-label result: identical to the original view */}
      {singleError && (
        <p style={{ marginTop: 16, padding: 14, background: "#fdecea", borderRadius: 8, color: "#8a1f1f" }}>
          {singleError}
        </p>
      )}
      {singleResult?.verdict && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 24, padding: 14, borderRadius: 8, background: OVERALL[singleResult.verdict.overall].bg }}>
            {OVERALL[singleResult.verdict.overall].text}
          </h2>
          <ChecksView verdict={singleResult.verdict} />
          <p style={{ color: "#555", fontSize: 16 }}>
            Time taken: {(singleResult.verdict.timing.total / 1000).toFixed(1)} seconds (reading the label:{" "}
            {(singleResult.verdict.timing.extract / 1000).toFixed(1)}s).
          </p>
        </section>
      )}

      {/* Batch results: one row per label, streaming in as each finishes */}
      {files.length > 1 && results.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 22 }}>
            Results ({doneCount} of {results.length} done)
          </h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {results.map((r, i) => (
              <li key={i} style={{ borderBottom: "1px solid #ddd", padding: "10px 0" }}>
                {r.state === "waiting" && <span>⏳ <strong>{r.name}</strong> - waiting</span>}
                {r.state === "checking" && <span>🔎 <strong>{r.name}</strong> - checking...</span>}
                {r.state === "error" && (
                  <span>⚠️ <strong>{r.name}</strong> - {r.error}</span>
                )}
                {r.state === "done" && r.verdict && (
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 18, padding: "4px 0" }}>
                      {r.verdict.overall === "PASS" && "✅"}
                      {r.verdict.overall === "PASS_WITH_NOTES" && "🟡"}
                      {r.verdict.overall === "FAIL" && "❌"}{" "}
                      <strong>{r.name}</strong> -{" "}
                      {r.verdict.overall === "PASS"
                        ? "passes"
                        : r.verdict.overall === "PASS_WITH_NOTES"
                          ? "passes with notes"
                          : "does not pass"}
                    </summary>
                    <div style={{ paddingLeft: 12 }}>
                      <ChecksView verdict={r.verdict} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
