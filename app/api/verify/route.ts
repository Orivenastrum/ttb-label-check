import { NextResponse } from "next/server";
import { extractLabel } from "@/lib/extract";
import { assembleVerdict, type ExpectedFields } from "@/lib/match";
import { createTimer } from "@/lib/timing";
import type { LabelFields } from "@/lib/types";

export const maxDuration = 30;

type Body = {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  expected: ExpectedFields;
};

export async function POST(req: Request) {
  const total = Date.now();
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body?.imageBase64 || !body?.expected) {
    return NextResponse.json({ error: "Missing image or expected fields." }, { status: 400 });
  }

  const timer = createTimer();
  let fields: LabelFields;
  try {
    fields = await timer.stage("extract", () =>
      extractLabel(body.imageBase64, body.mediaType ?? "image/jpeg"),
    );
  } catch (e) {
    const msg =
      e instanceof Error && /timeout|timed out/i.test(e.message)
        ? "Extraction timed out. Please try again."
        : "Could not read the label image. Please try again with a clearer photo.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const matchStart = Date.now();
  const verdict = assembleVerdict(body.expected, fields, {
    upload: 0,
    extract: timer.timings.extract ?? 0,
    match: 0,
    total: 0,
  });
  verdict.timing.match = Date.now() - matchStart;
  verdict.timing.total = Date.now() - total;

  return NextResponse.json(verdict);
}
