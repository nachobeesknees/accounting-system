"use server";

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import {
  buildOcrPrompt,
  cleanExtraction,
  OCR_MAX_FILE_BYTES,
  stripCodeFence,
  type OcrExtraction,
  type OcrFormType,
  type OcrResult,
} from "./ocr";

const MODEL = "claude-haiku-4-5-20251001";

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  return new Anthropic({ apiKey: key });
}

function isImageMime(mime: string): mime is "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
  );
}

async function extractDocument(
  formType: OcrFormType,
  file: File,
): Promise<OcrResult> {
  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  if (file.size > OCR_MAX_FILE_BYTES) {
    return { ok: false, error: "File is too large (max 25 MB)." };
  }

  const mime = file.type || "application/octet-stream";
  const isPdf = mime === "application/pdf";
  const imageMime = isImageMime(mime) ? mime : null;
  if (!isPdf && !imageMime) {
    return {
      ok: false,
      error: `Unsupported file type: ${mime}. Use PDF, PNG, JPEG, GIF, or WebP.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");

  const client = getClient();

  const content: Anthropic.ContentBlockParam[] = [
    isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMime!,
            data: base64,
          },
        },
    { type: "text", text: buildOcrPrompt(formType) },
  ];

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude API call failed.";
    return { ok: false, error: msg };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, error: "Claude returned no text." };
  }

  let parsed: { data?: unknown; rawText?: unknown };
  try {
    parsed = JSON.parse(stripCodeFence(textBlock.text));
  } catch {
    return { ok: false, error: "Could not parse model response as JSON." };
  }

  const data: OcrExtraction = cleanExtraction(parsed.data);
  const rawText = typeof parsed.rawText === "string" ? parsed.rawText : "";

  return { ok: true, formType, data, rawText };
}

export async function extractDocumentAction(formData: FormData): Promise<OcrResult> {
  const formType = String(formData.get("formType") ?? "");
  const file = formData.get("file");
  if (
    formType !== "invoice" &&
    formType !== "bill" &&
    formType !== "contact" &&
    formType !== "journal_entry"
  ) {
    return { ok: false, error: "Invalid formType." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Missing file." };
  }
  return extractDocument(formType, file);
}
