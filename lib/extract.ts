// extract_label(image) -> LabelFields - the ONLY file that knows a vendor exists
// (the Marcus seam). A self-hosted OCR implementation drops in behind this same
// function without touching matching, API, or UI.
import Anthropic from "@anthropic-ai/sdk";
import type { LabelFields } from "./types";

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    brandName: { type: ["string", "null"], description: "Brand name as printed on the label" },
    classType: { type: ["string", "null"], description: "Class/type designation, e.g. 'Kentucky Straight Bourbon Whiskey'" },
    alcoholContent: { type: ["string", "null"], description: "Alcohol content exactly as printed, e.g. '45% Alc./Vol. (90 Proof)'" },
    netContents: { type: ["string", "null"], description: "Net contents, e.g. '750 mL'" },
    warningStatement: { type: ["string", "null"], description: "The full government warning statement EXACTLY as printed, character for character, including capitalization and punctuation. null if absent." },
    rawText: { type: "string", description: "All visible text on the label, briefly" },
  },
  required: ["brandName", "classType", "alcoholContent", "netContents", "warningStatement", "rawText"],
  additionalProperties: false,
} as const;

const client = new Anthropic();

export async function extractLabel(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<LabelFields> {
  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 1500, // rawText is the biggest cost - cap it
      thinking: { type: "disabled" }, // latency: R2's 5-second budget
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            {
              type: "text",
              text: "Extract the label fields from this alcohol beverage label image. Transcribe the warning statement EXACTLY as printed - preserve capitalization, punctuation, and wording character-for-character. Do not correct or normalize anything.",
            },
          ],
        },
      ],
    },
    { timeout: 10_000, maxRetries: 0 }, // hard timeout, honest error - no retry (it would hide variance)
  );

  if (response.stop_reason === "refusal") {
    throw new Error("Extraction was declined by the vision model. Please try a different image.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Extraction returned no text output.");
  }
  return JSON.parse(text.text) as LabelFields;
}
