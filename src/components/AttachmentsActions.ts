"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { getSessionUser } from "@/lib/session";
import { getAttachmentById } from "@/lib/data";
import { createAttachment, deleteAttachment } from "@/lib/mutations";
import type { AttachmentRecordType } from "@/lib/types";

const VALID_TYPES: AttachmentRecordType[] = [
  "journal_entry",
  "invoice",
  "bill",
  "contact",
  "entity",
  "asset",
  "bank_account",
  "fee",
  "time_entry",
  "other",
];

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB ceiling

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function backTo(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${path}?${qs}`;
}

export async function uploadAttachmentAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const recordTypeRaw = String(formData.get("recordType") ?? "");
  const recordId = String(formData.get("recordId") ?? "");
  const redirectPath = String(formData.get("redirectPath") ?? "/");
  const documentType = String(formData.get("documentType") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const file = formData.get("file");

  if (!(VALID_TYPES as readonly string[]).includes(recordTypeRaw)) {
    redirect(backTo(redirectPath, { error: "Invalid record type." }));
  }
  if (!recordId) {
    redirect(backTo(redirectPath, { error: "Missing record id." }));
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(backTo(redirectPath, { error: "Pick a file to upload." }));
  }
  if (file.size > MAX_BYTES) {
    redirect(
      backTo(redirectPath, {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB > 25 MB).`,
      }),
    );
  }

  // Upload to Vercel Blob. Falls back to a clear error when the token is
  // missing (e.g. local dev without BLOB_READ_WRITE_TOKEN).
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    redirect(
      backTo(redirectPath, {
        error:
          "BLOB_READ_WRITE_TOKEN is not set. Configure Vercel Blob to enable uploads.",
      }),
    );
  }

  // Namespace blobs by record type + id so listing/cleanup is easy.
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const pathname = `attachments/${recordTypeRaw}/${recordId}/${Date.now()}-${safeName}`;

  let blobUrl: string;
  let blobPathname: string;
  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
    });
    blobUrl = blob.url;
    blobPathname = blob.pathname;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Blob upload failed";
    redirect(backTo(redirectPath, { error: `Upload failed: ${msg}` }));
  }

  try {
    await createAttachment(user, {
      recordType: recordTypeRaw as AttachmentRecordType,
      recordId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      fileUrl: blobUrl,
      blobPathname,
      documentType: documentType || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Insert failed";
    redirect(backTo(redirectPath, { error: msg }));
  }
  revalidatePath(redirectPath);
  redirect(backTo(redirectPath, { uploaded: "1" }));
}

export async function deleteAttachmentAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const redirectPath = String(formData.get("redirectPath") ?? "/");
  if (!id) redirect(redirectPath);

  const existing = await getAttachmentById(id);
  if (existing?.blobPathname && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(existing.blobPathname);
    } catch {
      // Blob already gone or transient — drop the row anyway.
    }
  }
  try {
    await deleteAttachment(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath(redirectPath);
  redirect(backTo(redirectPath, { uploaded: "deleted" }));
}
