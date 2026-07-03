import Link from "next/link";

import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatDate } from "@/lib/format";
import {
  FILING_KIND_LABELS,
  FILING_RECURRENCE_LABELS,
  isOpenFilingStatus,
  todayIso,
} from "@/lib/compliance";
import type { EntityFiling } from "@/lib/types";
import { markFilingFiledAction } from "@/app/(app)/filings/actions";

/**
 * Shared filings table — used by the firm-wide /filings calendar and the
 * per-entity Compliance card. Quick actions (Mark filed / Edit) only
 * render when the viewer holds filing.write.
 */
export function FilingsTable({
  filings,
  entityLabelById,
  userNameById,
  canWrite,
  returnTo,
  showEntity = true,
}: {
  filings: EntityFiling[];
  /** entityId → "CODE — Name" for the entity link column. */
  entityLabelById: Map<string, string>;
  /** userId → full name for the owner column. */
  userNameById: Map<string, string>;
  canWrite: boolean;
  /** Path the quick actions return to after completing. */
  returnTo: string;
  showEntity?: boolean;
}) {
  const today = todayIso();
  return (
    <Table>
      <THead>
        <TR hover={false}>
          {showEntity && <TH>Entity</TH>}
          <TH>Filing</TH>
          <TH>Jurisdiction</TH>
          <TH>Due</TH>
          <TH>Recurrence</TH>
          <TH>Owner</TH>
          <TH>Status</TH>
          {canWrite && <TH></TH>}
        </TR>
      </THead>
      <TBody>
        {filings.map((f) => {
          const open = isOpenFilingStatus(f.status);
          const overdue = open && f.dueDate < today;
          return (
            <TR key={f.id} href={canWrite ? `/filings/${f.id}` : undefined}>
              {showEntity && (
                <TD>
                  <Link
                    href={`/entities/${f.entityId}`}
                    style={{ color: "var(--ink)", textDecoration: "none" }}
                  >
                    {entityLabelById.get(f.entityId) ?? f.entityId}
                  </Link>
                </TD>
              )}
              <TD wrap>
                <span className="inline-flex items-center gap-2">
                  <span style={{ color: "var(--ink)" }}>{f.title}</span>
                  <Pill variant="neutral">{FILING_KIND_LABELS[f.kind]}</Pill>
                </span>
              </TD>
              <TD style={{ color: "var(--ink-3)" }}>{f.jurisdiction ?? "—"}</TD>
              <TD neg={overdue}>{formatDate(f.dueDate)}</TD>
              <TD style={{ color: "var(--ink-3)" }}>
                {FILING_RECURRENCE_LABELS[f.recurrence]}
              </TD>
              <TD style={{ color: "var(--ink-3)" }}>
                {f.ownerUserId ? userNameById.get(f.ownerUserId) ?? f.ownerUserId : "—"}
              </TD>
              <TD>
                <Pill variant={overdue ? "review" : statusVariant(f.status)}>
                  {overdue ? "Overdue" : statusLabel(f.status)}
                </Pill>
              </TD>
              {canWrite && (
                <TD>
                  <span className="inline-flex items-center gap-2">
                    {open && (
                      <form action={markFilingFiledAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="entityId" value={f.entityId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          className="text-[12px]"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--ink-2)",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Mark filed
                        </button>
                      </form>
                    )}
                    <Link
                      href={`/filings/${f.id}?returnTo=${encodeURIComponent(returnTo)}`}
                      style={{ color: "var(--ink-3)", textDecoration: "none", fontSize: 12 }}
                    >
                      Edit →
                    </Link>
                  </span>
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
