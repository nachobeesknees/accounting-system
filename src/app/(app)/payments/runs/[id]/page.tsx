import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, type PillVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getBankAccountById,
  getBills,
  getJournalEntries,
  getPaymentRunById,
  getPaymentRunItemsByRunId,
  getSignersByBankAccountId,
  getUsers,
  getVendors,
} from "@/lib/data";
import { formatDate, maskAccountNumber } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import type { PaymentRunItemStatus, PaymentRunStatus } from "@/lib/types";

import { releaseRunAction, voidRunAction } from "./actions";

function runStatusVariant(status: PaymentRunStatus): PillVariant {
  switch (status) {
    case "released":
      return "active";
    case "pending_release":
      return "pending";
    case "void":
      return "review";
    default:
      return "neutral";
  }
}

function itemStatusVariant(status: PaymentRunItemStatus): PillVariant {
  switch (status) {
    case "paid":
      return "active";
    case "skipped":
      return "review";
    default:
      return "pending";
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; released?: string }>;
}) {
  const { id } = await params;
  const { error, released } = await searchParams;

  const [run, user] = await Promise.all([getPaymentRunById(id), getSessionUser()]);
  if (!run) notFound();

  const [items, bills, vendors, bank, signers, users, entries] = await Promise.all([
    getPaymentRunItemsByRunId(run.id),
    getBills(),
    getVendors(),
    getBankAccountById(run.bankAccountId),
    getSignersByBankAccountId(run.bankAccountId),
    getUsers(),
    getJournalEntries(),
  ]);
  const billsById = new Map(bills.map((b) => [b.id, b] as const));
  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const entriesById = new Map(entries.map((e) => [e.id, e] as const));

  const currency = bank?.currencyCode ?? "USD";
  const total = parseAmount(run.total);

  const canRelease = hasPermission(user, "payment.release");
  const isPreparer = !!user && !!run.preparedBy && user.userId === run.preparedBy;
  const pending = run.status === "pending_release";

  // Signing-authority check on the funding account: if signers are
  // configured and nobody holds sole authority, the bank will require two
  // signatures on the payment file.
  const dualSignaturesRequired =
    signers.length > 0 && !signers.some((s) => s.authority === "sole");

  function userName(uid: string | null): string {
    if (!uid) return "—";
    return usersById.get(uid)?.fullName ?? uid;
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Payment runs", href: "/payments/runs" },
          { label: run.runNumber },
        ]}
      />
      <PageHeader
        title={run.runNumber}
        meta={`${run.itemCount} bill${run.itemCount === 1 ? "" : "s"} · ${formatMoney(total, currency)}`}
        actions={
          <>
            <ButtonLink href="/payments/runs" variant="secondary">
              ← All runs
            </ButtonLink>
            {/* Dual control: the bank-executable payment file exists only
                after a second user releases the run. */}
            {run.status === "released" && (
              <ButtonLink href={`/api/payment-runs/${run.id}/csv`} variant="secondary">
                Download payment file (CSV)
              </ButtonLink>
            )}
            <Pill variant={runStatusVariant(run.status)}>{statusLabel(run.status)}</Pill>
          </>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}
        {released && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Run released — payments posted and bills updated.
          </div>
        )}
        {dualSignaturesRequired && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-pending-bg)",
              color: "var(--p-pending-fg)",
              border: "1px solid var(--p-pending-fg)",
            }}
          >
            Dual signatures required: no signer on {bank?.name ?? "the funding account"}{" "}
            holds sole authority — the bank will need two signatures on this
            payment file.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="md:col-span-2">
            <Card
              title="Items"
              actions={
                <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                  {run.status === "released"
                    ? "Amounts as posted at release"
                    : "Amounts snapshotted at preparation"}
                </span>
              }
            >
              {items.length === 0 ? (
                <Empty title="No items" body="This run has no payment items." />
              ) : (
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Bill #</TH>
                      <TH>Vendor</TH>
                      <TH>Due date</TH>
                      <TH>Status</TH>
                      <TH>Journal entry</TH>
                      <TH num>Amount ({currency})</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {items.map((item) => {
                      const bill = billsById.get(item.billId);
                      const vendor = bill ? vendorsById.get(bill.vendorId) : undefined;
                      const je = item.journalEntryId
                        ? entriesById.get(item.journalEntryId)
                        : undefined;
                      return (
                        <TR key={item.id}>
                          <TD mono>
                            {bill ? (
                              <Link
                                href={`/bills/${bill.id}`}
                                style={{ color: "var(--ink)", textDecoration: "none" }}
                              >
                                {bill.billNumber}
                              </Link>
                            ) : (
                              item.billId
                            )}
                          </TD>
                          <TD>{vendor?.name ?? "—"}</TD>
                          <TD style={{ color: "var(--ink-3)" }}>
                            {bill ? formatDate(bill.dueDate) : "—"}
                          </TD>
                          <TD>
                            <Pill variant={itemStatusVariant(item.status)}>
                              {statusLabel(item.status)}
                            </Pill>
                          </TD>
                          <TD mono>
                            {je ? (
                              <Link
                                href={`/journal/${je.entryNumber}`}
                                style={{ color: "var(--ink)", textDecoration: "none" }}
                              >
                                {je.entryNumber}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TD>
                          <TD num>
                            {/* Payment rows keep cents — they must match the
                                bank file to the penny. */}
                            {formatMoney(parseAmount(item.amount), currency, {
                              paren: true,
                              hideCurrency: true,
                            })}
                          </TD>
                        </TR>
                      );
                    })}
                    <TR total hover={false}>
                      <TD>Total</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD num>
                        {formatMoney(total, currency, { paren: true, hideCurrency: true })}
                      </TD>
                    </TR>
                  </TBody>
                </Table>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-3.5">
            <Card title="Run details">
              <div className="p-3.5 flex flex-col gap-1.5 text-[12.5px]">
                <div style={{ color: "var(--ink-3)" }}>
                  Funding account:{" "}
                  {bank ? (
                    <Link href={`/bank/${bank.id}`} style={{ color: "var(--ink-2)" }}>
                      {bank.name} {maskAccountNumber(bank.accountNumber, bank.lastFour)}
                    </Link>
                  ) : (
                    run.bankAccountId
                  )}
                </div>
                <div style={{ color: "var(--ink-3)" }}>
                  Prepared by:{" "}
                  <span style={{ color: "var(--ink-2)" }}>{userName(run.preparedBy)}</span>
                  {run.preparedAt ? ` · ${formatDate(run.preparedAt.slice(0, 10))}` : ""}
                </div>
                <div style={{ color: "var(--ink-3)" }}>
                  Released by:{" "}
                  <span style={{ color: "var(--ink-2)" }}>{userName(run.releasedBy)}</span>
                  {run.releasedAt ? ` · ${formatDate(run.releasedAt.slice(0, 10))}` : ""}
                </div>
                {run.notes && (
                  <div style={{ color: "var(--ink-3)", whiteSpace: "pre-line" }}>
                    {run.notes}
                  </div>
                )}
                <div style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
                  {signers.length} signer{signers.length === 1 ? "" : "s"} on the
                  funding account
                  {dualSignaturesRequired ? " · dual signatures required" : ""}
                </div>
              </div>
            </Card>

            {pending && (
              <Card title="Release (dual control)">
                <div className="p-3.5 flex flex-col gap-2.5 text-[12.5px]">
                  <div style={{ color: "var(--ink-3)" }}>
                    Releasing posts each pending item through the standard
                    bill-payment flow (AP debit / cash credit) dated today, and
                    marks the run released.
                  </div>
                  {isPreparer && (
                    <div
                      className="rounded-md px-2.5 py-1.5"
                      style={{
                        background: "var(--p-pending-bg)",
                        color: "var(--p-pending-fg)",
                      }}
                    >
                      You prepared this run, so you cannot release it — a second
                      authorized user must.
                    </div>
                  )}
                  {!canRelease && !isPreparer && (
                    <div style={{ color: "var(--ink-4)" }}>
                      Releasing requires the payment.release permission.
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <form action={voidRunAction}>
                      <input type="hidden" name="runId" value={run.id} />
                      <ConfirmButton
                        label="Void run"
                        title={`Void payment run ${run.runNumber}?`}
                        message="Nothing has been posted yet — voiding just cancels the prepared batch. The bills stay payable."
                        confirmText="Void run"
                      />
                    </form>
                    <form action={releaseRunAction}>
                      <input type="hidden" name="runId" value={run.id} />
                      <Button
                        variant="primary"
                        type="submit"
                        disabled={!canRelease || isPreparer}
                        style={
                          !canRelease || isPreparer
                            ? { opacity: 0.5, cursor: "not-allowed" }
                            : undefined
                        }
                      >
                        Release {run.itemCount} payment{run.itemCount === 1 ? "" : "s"}
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
