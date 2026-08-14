// Corpus runner: posts every test-labels fixture to /api/verify and prints
// expected vs actual, plus p50/p95 timing (R2 evidence).
// Usage: node scripts/bench.mjs [baseUrl]
import fs from "fs";
import path from "path";

const BASE = process.argv[2] ?? "https://ttb-label-check-ruddy.vercel.app";
const dir = path.join(process.cwd(), "test-labels");
const fixtures = JSON.parse(fs.readFileSync(path.join(dir, "fixtures.json"), "utf8"));

const rows = [];
const times = [];

for (const c of fixtures.cases) {
  const img = fs.readFileSync(path.join(dir, c.image)).toString("base64");
  const start = Date.now();
  let actual, failedFields = "", error = "";
  try {
    const res = await fetch(`${BASE}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: img,
        mediaType: "image/png",
        expected: c.application,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      actual = "ERROR";
      error = data.error ?? `HTTP ${res.status}`;
    } else {
      actual = data.overall;
      failedFields = data.checks
        .filter((k) => k.status === "MISMATCH" || k.status === "MISSING")
        .map((k) => `${k.field}:${k.status}`)
        .join(", ");
      times.push(data.timing.total);
    }
  } catch (e) {
    actual = "ERROR";
    error = e.message;
  }
  const ms = Date.now() - start;

  const exp = c.expected.overall;
  const ok =
    exp === "ANY" || exp === "FAIL_OR_UNREADABLE"
      ? "documented"
      : (exp === "PASS" && (actual === "PASS" || actual === "PASS_WITH_NOTES")) ||
          (exp === "FAIL" && actual === "FAIL")
        ? "OK"
        : "WRONG";
  rows.push({ image: c.image, expected: exp, actual, result: ok, failedFields, ms, error });
  console.error(`${c.image}: ${actual} (${ms}ms) ${error}`);
}

console.log("\n| Image | Expected | Actual | Result | Failing fields | ms |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| ${r.image} | ${r.expected} | ${r.actual}${r.error ? ` (${r.error})` : ""} | ${r.result} | ${r.failedFields} | ${r.ms} |`,
  );
}

if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  console.log(`\nServer-side total: p50=${pct(50)}ms p95=${pct(95)}ms over ${times.length} labels`);
}
const wrong = rows.filter((r) => r.result === "WRONG").length;
console.log(`${rows.length - wrong}/${rows.length} as expected (${wrong} wrong)`);
