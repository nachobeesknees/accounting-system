import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getAttachmentById } from "@/lib/data";
import { requireReadRecord } from "@/lib/record-access";
import { getSessionUser } from "@/lib/session";

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/["\r\n]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const attachment = await getAttachmentById(id);
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  try {
    await requireReadRecord(user, attachment.recordType, attachment.recordId);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new NextResponse("Blob storage is not configured.", { status: 503 });
  }

  const source = attachment.blobPathname ?? attachment.fileUrl;
  const access = attachment.fileUrl.includes(".private.")
    ? "private"
    : "public";
  const result = await get(source, { access, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.blob.contentType || attachment.mimeType,
      "Content-Disposition": contentDisposition(attachment.fileName),
      "Cache-Control": "private, no-store",
    },
  });
}
