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
        return "The warning statement does not match the required wording. The comparison is shown below.";
      }
      return `${label} on the label does not match the application. The comparison is shown below.`;
  }
}

// Colors always paired with words - never color alone.
const TONE = {
  pass: { bg: "#e8f5e9", fg: "#1b5e20", border: "#a5d6a7" },
  note: { bg: "#fff8e1", fg: "#6d4c00", border: "#ffe082" },
  fail: { bg: "#fdecea", fg: "#8a1f1f", border: "#f5c2c0" },
  wait: { bg: "#f2f2f2", fg: "#333333", border: "#cccccc" },
};

function Badge({ kind }: { kind: "PASS" | "PASS WITH NOTES" | "FAIL" | "ERROR" | "CHECKING" | "WAITING" }) {
  const tone =
    kind === "PASS" ? TONE.pass : kind === "PASS WITH NOTES" ? TONE.note : kind === "FAIL" || kind === "ERROR" ? TONE.fail : TONE.wait;
  return (
    <strong
      style={{
        display: "inline-block",
        padding: "2px 12px",
        borderRadius: 6,
        border: `2px solid ${tone.border}`,
        background: tone.bg,
        color: tone.fg,
        fontSize: 17,
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {kind}
    </strong>
  );
}

const overallBadge = (o: Verdict["overall"]) =>
  o === "PASS" ? "PASS" : o === "PASS_WITH_NOTES" ? "PASS WITH NOTES" : "FAIL";

// Expected vs found, side by side, plainly labeled. Stacks on narrow screens.
function FailureDetail({ c }: { c: CheckResult }) {
  if (c.status !== "MISMATCH" && c.status !== "MISSING") return null;
  const box: React.CSSProperties = {
    background: "#f7f7f7",
    border: "1px solid #bbb",
    borderRadius: 8,
    padding: 14,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: 17,
    color: "#1a1a1a",
  };
  return (
    <div style={{ marginTop: 10, width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        <div style={box}>
          <strong style={{ display: "block", marginBottom: 6 }}>What the application says:</strong>
          {c.expected ?? "(nothing provided)"}
        </div>
        <div style={box}>
          <strong style={{ display: "block", marginBottom: 6 }}>What the label shows:</strong>
          {c.status === "MISSING" || c.found === null || c.found.trim() === ""
            ? "(nothing found on the label)"
            : c.found}
        </div>
      </div>
      {c.diff && (
        <div style={{ ...box, background: TONE.note.bg, border: `1px solid ${TONE.note.border}`, marginTop: 12 }}>
          <strong style={{ display: "block", marginBottom: 6 }}>
            Where they first differ (character {c.diff.at + 1}):
          </strong>
          The application says: "...{c.diff.expected}..."
          <br />
          The label shows: "...{c.diff.found}..."
        </div>
      )}
    </div>
  );
}

const STATUS_WORD = {
  MATCH: { icon: "✅", word: "OK" },
  MATCH_WITH_NOTE: { icon: "🟡", word: "NOTE" },
  MISMATCH: { icon: "❌", word: "PROBLEM" },
  MISSING: { icon: "❌", word: "MISSING" },
};

// The per-check list, shared by the single-label view and each batch row.
function ChecksView({ verdict }: { verdict: Verdict }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {verdict.checks.map((c) => (
        <li
          key={c.field}
          style={{ padding: "14px 0", borderBottom: "1px solid #ccc", display: "flex", gap: 12, flexWrap: "wrap" }}
        >
          <span aria-hidden style={{ fontSize: 22 }}>{STATUS_WORD[c.status].icon}</span>
          <span style={{ flex: 1, minWidth: 220, fontSize: 18 }}>
            <strong>{FIELD_LABELS[c.field] ?? c.field}</strong>{" "}
            <span
              style={{
                fontWeight: 700,
                color:
                  c.status === "MATCH" ? TONE.pass.fg : c.status === "MATCH_WITH_NOTE" ? TONE.note.fg : TONE.fail.fg,
              }}
            >
              [{STATUS_WORD[c.status].word}]
            </span>
            {" - "}
            {plainReason(c)}
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
  minHeight: 48,
  width: "100%",
  boxSizing: "border-box",
  border: "2px solid #767676",
  borderRadius: 8,
  color: "#1a1a1a",
  background: "#ffffff",
};

const CONCURRENCY = 3;

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState({ brandName: "", classType: "", alcoholContent: "", netContents: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LabelResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function takeFiles(list: FileList | File[] | null) {
    const f = list ? Array.from(list).filter((x) => x.type.startsWith("image/") || x.name.match(/\.(png|jpe?g|webp|gif)$/i)) : [];
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
      setError("Please choose at least one label photo first, using the big grey button above.");
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
  const singleChecking = single && busy;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, lineHeight: 1.6, color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 30 }}>Label Verification</h1>
      <p style={{ fontSize: 18 }}>
        Upload one label photo, or several at once. Type in what the application says,
        then press the blue button. You will get a clear PASS or FAIL for each label.
      </p>

      <section style={{ margin: "28px 0" }}>
        <h2 style={{ fontSize: 23 }}>Step 1. Choose the label photo(s)</h2>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => takeFiles(e.target.files)}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            takeFiles(e.dataTransfer.files);
          }}
          style={{
            border: dragOver ? "3px solid #1a6fb4" : "3px dashed #767676",
            borderRadius: 10,
            padding: 20,
            textAlign: "center",
            background: dragOver ? "#eef5fb" : "#fafafa",
          }}
        >
          <button
            onClick={() => fileInput.current?.click()}
            style={{
              fontSize: 20,
              fontWeight: 700,
              padding: "14px 28px",
              minHeight: 56,
              borderRadius: 8,
              border: "2px solid #555",
              background: "#f2f2f2",
              color: "#1a1a1a",
              cursor: "pointer",
            }}
          >
            📷 Choose photo(s) from your computer
          </button>
          <p style={{ margin: "10px 0 0", fontSize: 16, color: "#444" }}>
            or drag pictures here and drop them
          </p>
          {files.length > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 18, fontWeight: 600 }}>
              {files.length === 1 ? `Photo chosen: ${files[0].name}` : `${files.length} photos chosen`}
            </p>
          )}
        </div>
        {preview && (
          <img
            src={preview}
            alt="The label photo you chose"
            style={{ maxWidth: "100%", maxHeight: 300, marginTop: 12, borderRadius: 8, border: "1px solid #ccc" }}
          />
        )}
      </section>

      <section style={{ margin: "28px 0" }}>
        <h2 style={{ fontSize: 23 }}>Step 2. Type in what the application says</h2>
        {files.length > 1 && (
          <p
            style={{
              fontSize: 17,
              padding: 12,
              background: TONE.note.bg,
              border: `2px solid ${TONE.note.border}`,
              borderRadius: 8,
              color: TONE.note.fg,
            }}
          >
            <strong>Please note:</strong> the values you type here are checked against{" "}
            <strong>every</strong> uploaded photo. If your photos are different products,
            check them one at a time instead.
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
          <label key={key} style={{ display: "block", marginBottom: 16 }}>
            <span style={{ display: "block", fontWeight: 700, marginBottom: 4, fontSize: 18 }}>{label}</span>
            <input
              style={inputStyle}
              placeholder={placeholder}
              value={fields[key]}
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            />
          </label>
        ))}
      </section>

      <h2 style={{ fontSize: 23 }}>Step 3. Check</h2>
      <button
        onClick={submit}
        disabled={busy}
        style={{
          fontSize: 22,
          fontWeight: 700,
          padding: "16px 24px",
          minHeight: 60,
          width: "100%",
          borderRadius: 10,
          border: "none",
          background: busy ? "#5a8fbd" : "#155d99",
          color: "white",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy
          ? files.length > 1
            ? `Working... ${doneCount} of ${files.length} labels done`
            : "Working... reading the label now"
          : files.length > 1
            ? `Check these ${files.length} labels`
            : "Check this label"}
      </button>

      {/* Live status line so nothing ever looks hung */}
      <p aria-live="polite" style={{ fontSize: 17, color: "#333", minHeight: 24, marginTop: 10 }}>
        {singleChecking && "Reading the label usually takes 5 to 10 seconds. Please wait..."}
        {busy && files.length > 1 && `Checking up to 3 labels at a time. ${doneCount} of ${files.length} finished so far.`}
      </p>

      {error && (
        <p
          style={{
            marginTop: 12,
            padding: 14,
            background: TONE.fail.bg,
            border: `2px solid ${TONE.fail.border}`,
            borderRadius: 8,
            color: TONE.fail.fg,
            fontSize: 18,
          }}
        >
          <Badge kind="ERROR" /> {error}
        </p>
      )}

      {/* Single-label result */}
      {singleError && (
        <p
          style={{
            marginTop: 16,
            padding: 14,
            background: TONE.fail.bg,
            border: `2px solid ${TONE.fail.border}`,
            borderRadius: 8,
            color: TONE.fail.fg,
            fontSize: 18,
          }}
        >
          <Badge kind="ERROR" /> {singleError}
        </p>
      )}
      {singleResult?.verdict && (
        <section style={{ marginTop: 24 }}>
          <h2
            style={{
              fontSize: 26,
              padding: 16,
              borderRadius: 8,
              background:
                singleResult.verdict.overall === "FAIL"
                  ? TONE.fail.bg
                  : singleResult.verdict.overall === "PASS"
                    ? TONE.pass.bg
                    : TONE.note.bg,
              color:
                singleResult.verdict.overall === "FAIL"
                  ? TONE.fail.fg
                  : singleResult.verdict.overall === "PASS"
                    ? TONE.pass.fg
                    : TONE.note.fg,
              border: `2px solid ${
                singleResult.verdict.overall === "FAIL"
                  ? TONE.fail.border
                  : singleResult.verdict.overall === "PASS"
                    ? TONE.pass.border
                    : TONE.note.border
              }`,
            }}
          >
            {overallBadge(singleResult.verdict.overall)}
            {singleResult.verdict.overall === "PASS" && " - this label passes."}
            {singleResult.verdict.overall === "PASS_WITH_NOTES" && " - this label passes, with notes."}
            {singleResult.verdict.overall === "FAIL" && " - this label does not pass."}
          </h2>
          <ChecksView verdict={singleResult.verdict} />
          <p style={{ color: "#444", fontSize: 16 }}>
            Time taken: {(singleResult.verdict.timing.total / 1000).toFixed(1)} seconds (reading the label:{" "}
            {(singleResult.verdict.timing.extract / 1000).toFixed(1)}s).
          </p>
        </section>
      )}

      {/* Batch results: one row per label, streaming in as each finishes */}
      {files.length > 1 && results.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 23 }}>
            Results: {doneCount} of {results.length} labels finished
          </h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {results.map((r, i) => (
              <li key={i} style={{ borderBottom: "1px solid #ccc", padding: "12px 0", fontSize: 18 }}>
                {r.state === "waiting" && (
                  <span><Badge kind="WAITING" /> <strong>{r.name}</strong> - waiting its turn</span>
                )}
                {r.state === "checking" && (
                  <span><Badge kind="CHECKING" /> <strong>{r.name}</strong> - being read now...</span>
                )}
                {r.state === "error" && (
                  <span><Badge kind="ERROR" /> <strong>{r.name}</strong> - {r.error}</span>
                )}
                {r.state === "done" && r.verdict && (
                  <details>
                    <summary style={{ cursor: "pointer", padding: "4px 0" }}>
                      <Badge kind={overallBadge(r.verdict.overall)} /> <strong>{r.name}</strong>
                      <span style={{ color: "#444", fontSize: 16 }}> (click to see the details)</span>
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
