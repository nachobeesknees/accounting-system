/**
 * Types and prompt builders for document OCR via Claude Haiku. Imported by
 * both client components (for OcrExtraction / OcrResult typings) and the
 * server-action wrapper in `ocr-action.ts`.
 *
 * No "use server" here so client code can import the types without pulling
 * the SDK into the browser bundle.
 */

export type OcrFormType = "invoice" | "bill" | "contact" | "journal_entry";

export type OcrLineItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
};

export type OcrJournalLine = {
  account?: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

export type OcrExtraction = {
  vendorName?: string;
  invoiceNumber?: string;
  date?: string;
  dueDate?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  lineItems?: OcrLineItem[];

  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;

  reference?: string;
  description?: string;
  journalLines?: OcrJournalLine[];
};

export type OcrResult =
  | {
      ok: true;
      formType: OcrFormType;
      data: OcrExtraction;
      rawText: string;
    }
  | {
      ok: false;
      error: string;
    };

export const OCR_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const OCR_ACCEPT_TYPES =
  "application/pdf,image/png,image/jpeg,image/gif,image/webp";

const SCHEMA_BY_TYPE: Record<OcrFormType, string> = {
  invoice: `{
  "vendorName": "string — the seller/billing party name",
  "invoiceNumber": "string — invoice number/id",
  "date": "string — invoice/issue date, format YYYY-MM-DD",
  "dueDate": "string — payment due date, format YYYY-MM-DD",
  "lineItems": [{ "description": "string", "quantity": number, "unitPrice": number, "total": number }],
  "subtotal": number,
  "tax": number,
  "total": number
}`,
  bill: `{
  "vendorName": "string — the vendor/supplier billing us",
  "invoiceNumber": "string — vendor's invoice/bill number",
  "date": "string — bill date, format YYYY-MM-DD",
  "dueDate": "string — payment due date, format YYYY-MM-DD",
  "lineItems": [{ "description": "string", "quantity": number, "unitPrice": number, "total": number }],
  "subtotal": number,
  "tax": number,
  "total": number
}`,
  contact: `{
  "name": "string — primary person name if individual",
  "company": "string — organization/company name",
  "email": "string",
  "phone": "string",
  "address": "string — full address on one line"
}`,
  journal_entry: `{
  "date": "string — entry date, format YYYY-MM-DD",
  "reference": "string — reference / document number",
  "description": "string — short memo",
  "journalLines": [{ "account": "string — account name or code", "debit": number, "credit": number, "memo": "string" }]
}`,
};

export function buildOcrPrompt(formType: OcrFormType): string {
  return `You are an OCR + structured-data extractor. Read the attached document and return JSON.

Extract the fields below for a ${formType.replace("_", " ")}. Use null for any field you cannot determine confidently. Dates MUST be YYYY-MM-DD. Numbers MUST be plain JSON numbers (no currency symbols, no commas).

Return a single JSON object with EXACTLY these top-level keys:
{
  "data": ${SCHEMA_BY_TYPE[formType]},
  "rawText": "string — the full plain-text contents of the document, preserving line breaks"
}

Respond with only the JSON object, no prose.`;
}

export function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

export function cleanExtraction(data: unknown): OcrExtraction {
  if (!data || typeof data !== "object") return {};
  const out: OcrExtraction = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
