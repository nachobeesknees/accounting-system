"use client";

import { useRef, useState } from "react";

import { extractDocumentAction } from "@/lib/ocr-action";
import { OCR_ACCEPT_TYPES, type OcrExtraction, type OcrFormType } from "@/lib/ocr";

type Props = {
  formType: OcrFormType;
  /** Called when a successful extraction returns. Receives extracted fields
   *  plus the raw text (for storage in ocrText on the parent record). */
  onExtracted: (data: OcrExtraction, rawText: string) => void;
};

export function OcrUpload({ formType, onExtracted }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setFilename(file.name);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("formType", formType);
      fd.set("file", file);
      const result = await extractDocumentAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onExtracted(result.data, result.rawText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR failed.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="rounded-md flex items-center gap-3 px-3 py-2.5"
      style={{
        border: `1px dashed ${dragOver ? "var(--ink-2)" : "var(--line-2)"}`,
        background: dragOver ? "var(--rail)" : "var(--paper)",
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept={OCR_ACCEPT_TYPES}
        onChange={onPick}
        style={{ display: "none" }}
        disabled={busy}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        className="px-2.5 py-1 rounded-md text-[12px]"
        style={{
          background: "var(--rail)",
          border: "1px solid var(--line-2)",
          color: "var(--ink-2)",
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Extracting…" : "Upload document"}
      </button>
      <div className="text-[12px] flex-1" style={{ color: "var(--ink-3)" }}>
        {busy ? (
          <span>
            <Spinner /> Extracting data from <strong>{filename}</strong>…
          </span>
        ) : error ? (
          <span style={{ color: "var(--p-review-fg)" }}>{error}</span>
        ) : filename ? (
          <span>
            Extracted from <strong>{filename}</strong>. Review fields below.
          </span>
        ) : (
          <span>
            Drop a PDF or image here, or click upload — Claude Haiku will pre-fill the form.
          </span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block align-middle mr-1.5"
      style={{
        width: 10,
        height: 10,
        border: "1.5px solid var(--line-2)",
        borderTopColor: "var(--ink-2)",
        borderRadius: "50%",
        animation: "ocr-spin 0.8s linear infinite",
      }}
    />
  );
}

export function ReviewBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="rounded-md px-3 py-2 text-[12.5px] flex items-center justify-between gap-3"
      style={{
        background: "var(--p-review-bg)",
        color: "var(--p-review-fg)",
        border: "1px solid var(--p-review-fg)",
      }}
    >
      <span>
        <strong>Review extracted data.</strong> Fields below were auto-filled
        from your upload — please verify before saving.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--p-review-fg)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: 2,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
