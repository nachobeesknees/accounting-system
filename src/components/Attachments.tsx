import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getAttachments, getLookupValues, getUserById } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { AttachmentRecordType } from "@/lib/types";
import {
  deleteAttachmentAction,
  uploadAttachmentAction,
} from "./AttachmentsActions";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Reusable attachments card. Drop into any detail page with:
 *
 *   <Attachments
 *     recordType="invoice"
 *     recordId={invoice.id}
 *     redirectPath={`/invoices/${invoice.id}`}
 *   />
 *
 * Renders the file list with download/remove plus an upload form scoped
 * to the record. Document-type select is populated from the
 * `document_type` lookup table so it stays admin-editable.
 */
export async function Attachments({
  recordType,
  recordId,
  redirectPath,
}: {
  recordType: AttachmentRecordType;
  recordId: string;
  redirectPath: string;
}) {
  const [list, docTypes] = await Promise.all([
    getAttachments(recordType, recordId),
    getLookupValues("document_type"),
  ]);
  const uploaderIds = Array.from(
    new Set(list.map((a) => a.uploadedBy).filter((u): u is string => !!u)),
  );
  const uploaders = await Promise.all(uploaderIds.map((id) => getUserById(id)));
  const uploaderById = new Map(
    uploaders
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => [u.id, u]),
  );

  return (
    <Card
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>📎</span>
          <span>Attachments</span>
          {list.length > 0 && (
            <span
              className="text-[11px]"
              style={{
                color: "var(--ink-3)",
                background: "var(--rail)",
                border: "1px solid var(--line-2)",
                padding: "0 6px",
                borderRadius: 10,
              }}
            >
              {list.length}
            </span>
          )}
        </span>
      }
      actions={
        <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
          Stored in Vercel Blob · max 25 MB
        </span>
      }
    >
      {list.length === 0 ? (
        <Empty
          title="No attachments yet"
          body="Upload supporting documents below."
        />
      ) : (
        <Table>
          <THead>
            <TR hover={false}>
              <TH>File</TH>
              <TH>Type</TH>
              <TH num>Size</TH>
              <TH>Uploaded</TH>
              <TH>By</TH>
              <TH>Notes</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {list.map((a) => (
              <TR key={a.id}>
                <TD>
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--ink)", textDecoration: "none" }}
                  >
                    {a.fileName}
                  </a>
                </TD>
                <TD>
                  {a.documentType ? (
                    <Pill variant="neutral">{a.documentType}</Pill>
                  ) : (
                    <span style={{ color: "var(--ink-4)" }}>—</span>
                  )}
                </TD>
                <TD num style={{ color: "var(--ink-3)" }}>
                  {fmtSize(a.fileSize)}
                </TD>
                <TD style={{ color: "var(--ink-3)" }}>
                  {formatDate(a.createdAt.slice(0, 10))}
                </TD>
                <TD style={{ color: "var(--ink-3)" }}>
                  {a.uploadedBy
                    ? (uploaderById.get(a.uploadedBy)?.fullName ?? a.uploadedBy)
                    : "—"}
                </TD>
                <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                  {a.notes ?? "—"}
                </TD>
                <TD>
                  <div className="flex gap-2">
                    <a
                      href={a.fileUrl}
                      download={a.fileName}
                      className="px-2 py-1 text-[12px] rounded"
                      style={{
                        border: "1px solid var(--line-2)",
                        color: "var(--ink-2)",
                        textDecoration: "none",
                      }}
                    >
                      Download
                    </a>
                    <form action={deleteAttachmentAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        type="hidden"
                        name="redirectPath"
                        value={redirectPath}
                      />
                      <Button variant="ghost" type="submit">
                        Remove
                      </Button>
                    </form>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <form action={uploadAttachmentAction} className="mt-3.5">
        <input type="hidden" name="recordType" value={recordType} />
        <input type="hidden" name="recordId" value={recordId} />
        <input type="hidden" name="redirectPath" value={redirectPath} />
        <div className="flex flex-col gap-3">
          <input
            type="file"
            name="file"
            required
            className="text-[13px]"
          />
          <Row>
            <SmartSelectField
              label="Document type"
              name="documentType"
              options={docTypes.map((d) => ({ value: d.code, label: d.label }))}
              emptyLabel="—"
              clearable
            />
            <Field label="Notes" name="notes" />
          </Row>
          <div className="flex justify-end">
            <Button variant="primary" type="submit">
              Upload attachment
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
