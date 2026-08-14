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
      if (c.field === "warningStatement" && c.diff) {
        return `The warning statement does not match the required wording. First difference: the label shows "…${c.diff.found}…" where it should say "…${c.diff.expected}…".`;
      }
      return `${label} on the label ("${c.found ?? ""}") does not match the application ("${c.expected ?? ""}").`;
  }
}

// Resize client-side to max 1600px long edge, JPEG q0.8 — the biggest latency win.
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

const STATUS_ICON = { MATCH: "✅", MATCH_WITH_NOTE: "🟡", MISMATCH: "❌", MISSING: "❌" };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState({ brandName: "", classType: "", alcoholContent: "", netContents: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function onFile(f: File | null) {
    setFile(f);
    setVerdict(null);
    setError(null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!file) {
      setError("Please choose a label photo first.");
      return;
    }
    setBusy(true);
    setError(null);
    setVerdict(null);
    const start = Date.now();
    try {
      const { base64, mediaType } = await resizeImage(file);
      const uploadMs = Date.now() - start;
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType, expected: fields }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        (data as Verdict).timing.upload = uploadMs;
        setVerdict(data as Verdict);
      }
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 28 }}>Label Verification</h1>
      <p>
        Upload a photo of the label, type in what the application says, and press the
        big button. You will get a clear pass or fail for each item.
      </p>

      <section style={{ margin: "24px 0" }}>
        <h2 style={{ fontSize: 22 }}>1. The label photo</h2>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          style={{ ...inputStyle, cursor: "pointer", background: "#f2f2f2", textAlign: "left" }}
        >
          {file ? `Photo chosen: ${file.name}` : "📷 Choose a label photo…"}
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
        {busy ? "Checking the label… (a few seconds)" : "Check this label"}
      </button>

      {error && (
        <p style={{ marginTop: 16, padding: 14, background: "#fdecea", borderRadius: 8, color: "#8a1f1f" }}>
          {error}
        </p>
      )}

      {verdict && (
        <section style={{ marginTop: 24 }}>
          <h2
            style={{
              fontSize: 24,
              padding: 14,
              borderRadius: 8,
              background:
                verdict.overall === "FAIL" ? "#fdecea" : verdict.overall === "PASS" ? "#e8f5e9" : "#fff8e1",
            }}
          >
            {verdict.overall === "PASS" && "✅ This label passes."}
            {verdict.overall === "PASS_WITH_NOTES" && "🟡 This label passes, with notes."}
            {verdict.overall === "FAIL" && "❌ This label does not pass."}
          </h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {verdict.checks.map((c) => (
              <li
                key={c.field}
                style={{ padding: "12px 0", borderBottom: "1px solid #ddd", display: "flex", gap: 10 }}
              >
                <span aria-hidden style={{ fontSize: 22 }}>{STATUS_ICON[c.status]}</span>
                <span>{plainReason(c)}</span>
              </li>
            ))}
          </ul>
          <p style={{ color: "#555", fontSize: 16 }}>
            Time taken: {(verdict.timing.total / 1000).toFixed(1)} seconds (reading the label:{" "}
            {(verdict.timing.extract / 1000).toFixed(1)}s).
          </p>
        </section>
      )}
    </main>
  );
}
