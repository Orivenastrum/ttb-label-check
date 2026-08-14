// Dump full check detail for one fixture: node scripts/debug-case.mjs <image>
import fs from "fs";
import path from "path";

const BASE = process.argv[3] ?? "https://ttb-label-check-ruddy.vercel.app";
const dir = path.join(process.cwd(), "test-labels");
const fixtures = JSON.parse(fs.readFileSync(path.join(dir, "fixtures.json"), "utf8"));
const c = fixtures.cases.find((c) => c.image.startsWith(process.argv[2]));
const img = fs.readFileSync(path.join(dir, c.image)).toString("base64");
const res = await fetch(`${BASE}/api/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageBase64: img, mediaType: "image/png", expected: c.application }),
});
console.log(c.image, res.status);
console.log(JSON.stringify(await res.json(), null, 2));
