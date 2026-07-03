import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { PrintButton } from "@/components/PrintButton";
import {
  getBankAccountById,
  getContactById,
  getDistributionById,
  getEntityById,
  getJournalEntryById,
  getUsers,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getAllowedEntityIds } from "@/lib/entity-access";
import { formatDate, maskAccountNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import {
  DISTRIBUTION_STATUS_LABELS,
  distributionStatusVariant,
} from "@/lib/compliance";
import {
  approveDistributionAction,
  markDistributionPaidAction,
  rejectDistributionAction,
} from "../actions";

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dist = await getDistributionById(id);
  if (!dist) notFound();

  const [entity, beneficiary, bankAccount, users, journalEntry, allowedEntityIds] =
    await Promise.all([
      getEntityById(dist.entityId),
      getContactById(dist.beneficiaryContactId),
      dist.bankAccountId ? getBankAccountById(dist.bankAccountId) : Promise.resolve(undefined),
      getUsers(),
      dist.journalEntryId ? getJournalEntryById(dist.journalEntryId) : Promise.resolve(undefined),
      getAllowedEntityIds(user),
    ]);
  // user_entity_access scoping — out-of-scope entities 404, matching /entities/[id].
  if (allowedEntityIds !== null && !allowedEntityIds.has(dist.entityId)) {
    notFound();
  }
  const userNameById = new Map(users.map((u) => [u.id, u.fullName] as const));
  const nameOf = (uid: string | null) =>
    uid ? userNameById.get(uid) ?? uid : "—";

  const canApprove = hasPermission(user, "distribution.approve");
  const isRequester = !!dist.requestedBy && dist.requestedBy === user.userId;
  const isFirstApprover =
    !!dist.firstApprovedBy && dist.firstApprovedBy === user.userId;

  const canFirstApprove =
    dist.status === "requested" && canApprove && !isRequester;
  const canSecondApprove =
    dist.status === "first_approved" && canApprove && !isRequester && !isFirstApprover;
  const canReject =
    canApprove && ["requested", "first_approved", "approved"].includes(dist.status);
  const canPay = dist.status === "approved" && canApprove;

  // Only a FIRM account (unowned + GL-linked) posts to the ledger.
  // Client/entity-owned accounts stay operational even with a GL link.
  const postsToLedger =
    !!bankAccount?.accountId &&
    bankAccount.entityId == null &&
    bankAccount.clientId == null;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Distributions", href: "/distributions" },
          { label: dist.distributionNumber },
        ]}
      />
      <PageHeader
        title={dist.distributionNumber}
        meta={`${entity ? `${entity.code} — ${entity.name}` : dist.entityId} → ${beneficiary?.name ?? dist.beneficiaryContactId}`}
        actions={
          <>
            <ButtonLink variant="secondary" href="/distributions">
              ← All distributions
            </ButtonLink>
            <PrintButton />
            <Pill variant={distributionStatusVariant(dist.status)}>
              {DISTRIBUTION_STATUS_LABELS[dist.status] ?? dist.status}
            </Pill>
          </>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {sp.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {sp.error}
          </div>
        )}
        {sp.saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Saved.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <Card title="Details">
            <KVGrid>
              <KV
                k="Amount"
                v={formatMoney(dist.amount, dist.currencyCode, { paren: true })}
                mono
              />
              <KV
                k="Entity"
                v={
                  entity ? (
                    <Link
                      href={`/entities/${entity.id}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {entity.code} — {entity.name}
                    </Link>
                  ) : (
                    dist.entityId
                  )
                }
              />
              <KV
                k="Beneficiary"
                v={
                  beneficiary ? (
                    <Link
                      href={`/contacts/${beneficiary.id}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {beneficiary.name}
                    </Link>
                  ) : (
                    dist.beneficiaryContactId
                  )
                }
              />
              <KV
                k="Funding account"
                v={
                  bankAccount ? (
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/bank/${bankAccount.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {bankAccount.name} (
                        {maskAccountNumber(bankAccount.accountNumber, bankAccount.lastFour)})
                      </Link>
                      <Pill variant={postsToLedger ? "formation" : "neutral"}>
                        {postsToLedger ? "Firm account (posts JE)" : "Client account — no ledger"}
                      </Pill>
                    </span>
                  ) : (
                    "— none recorded —"
                  )
                }
              />
              <KV k="Resolution ref" v={dist.resolutionReference ?? "—"} mono />
              <KV
                k="Journal entry"
                v={
                  journalEntry ? (
                    <Link
                      href={`/journal/${journalEntry.entryNumber}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {journalEntry.entryNumber}
                    </Link>
                  ) : (
                    "—"
                  )
                }
                mono
              />
              <KV k="Notes" v={dist.notes ?? "—"} />
            </KVGrid>
          </Card>

          <Card title="Approval trail">
            <KVGrid>
              <KV
                k="Requested"
                v={`${nameOf(dist.requestedBy)} · ${when(dist.requestedAt)}`}
              />
              <KV
                k="First approval"
                v={
                  dist.firstApprovedAt
                    ? `${nameOf(dist.firstApprovedBy)} · ${when(dist.firstApprovedAt)}`
                    : "Pending"
                }
              />
              <KV
                k="Second approval"
                v={
                  dist.secondApprovedAt
                    ? `${nameOf(dist.secondApprovedBy)} · ${when(dist.secondApprovedAt)}`
                    : dist.firstApprovedAt
                      ? "Pending"
                      : "—"
                }
              />
              {dist.rejectedAt && (
                <KV
                  k="Rejected"
                  v={
                    <span style={{ color: "var(--p-review-fg)", whiteSpace: "normal" }}>
                      {nameOf(dist.rejectedBy)} · {when(dist.rejectedAt)}
                      {dist.rejectionReason ? ` — ${dist.rejectionReason}` : ""}
                    </span>
                  }
                />
              )}
              <KV
                k="Paid"
                v={dist.paidAt ? when(dist.paidAt) : "—"}
              />
            </KVGrid>
          </Card>
        </div>

        {(canFirstApprove || canSecondApprove || canReject || canPay) && (
          <Card title="Actions">
            <div className="flex flex-col gap-3 p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                {canFirstApprove && (
                  <form action={approveDistributionAction}>
                    <input type="hidden" name="id" value={dist.id} />
                    <input type="hidden" name="entityId" value={dist.entityId} />
                    <Button variant="primary" type="submit">
                      Approve (first of two)
                    </Button>
                  </form>
                )}
                {canSecondApprove && (
                  <form action={approveDistributionAction}>
                    <input type="hidden" name="id" value={dist.id} />
                    <input type="hidden" name="entityId" value={dist.entityId} />
                    <Button variant="primary" type="submit">
                      Approve (second — releases for payment)
                    </Button>
                  </form>
                )}
                {canPay && (
                  <form action={markDistributionPaidAction}>
                    <input type="hidden" name="id" value={dist.id} />
                    <input type="hidden" name="entityId" value={dist.entityId} />
                    <Button variant="primary" type="submit">
                      Mark paid
                    </Button>
                  </form>
                )}
                {dist.status === "requested" && canApprove && isRequester && (
                  <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    You requested this distribution — a different approver must
                    give the first approval.
                  </span>
                )}
                {dist.status === "first_approved" && canApprove && (isRequester || isFirstApprover) && (
                  <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    Second approval must come from someone other than the
                    requester and the first approver.
                  </span>
                )}
              </div>

              {canPay && (
                <div className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                  {postsToLedger
                    ? "Funding account is a firm account: marking paid posts a journal entry (Dr equity distributions / Cr bank) and records a bank transaction."
                    : "Funding account is a client/entity account: marking paid is an operational record only — no firm ledger activity."}
                </div>
              )}

              {canReject && (
                <form
                  action={rejectDistributionAction}
                  className="flex items-end gap-2 flex-wrap"
                  style={{ borderTop: "1px dashed var(--line)", paddingTop: 12 }}
                >
                  <input type="hidden" name="id" value={dist.id} />
                  <input type="hidden" name="entityId" value={dist.entityId} />
                  <div className="flex-1 min-w-[260px]">
                    <Field
                      label="Rejection reason"
                      name="reason"
                      required
                      placeholder="Why is this distribution being rejected?"
                    />
                  </div>
                  <Button variant="danger" type="submit">
                    Reject
                  </Button>
                </form>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
