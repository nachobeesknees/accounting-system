"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DrillNumber } from "@/components/DrillNumber";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatDate } from "@/lib/format";
import { formatAmount, formatMoney, parseAmount } from "@/lib/money";

import { runPaymentsAction } from "./actions";

export type PayRunBillRow = {
  id: string;
  billNumber: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  status: string;
  balanceDue: string;
  total: string;
  currencyCode: string;
  daysPastDue: number;
  firmCode: string | null;
  firmName: string | null;
};

export type PayRunRegionGroup = {
  regionId: string;
  regionName: string;
  bills: PayRunBillRow[];
};

export type PayRunBankOption = {
  id: string;
  name: string;
  currencyCode: string;
  lastFour: string | null;
  /** Current balance in the account's native currency. Used to drive the
   * "Cash on hand" tile when this bank is the active payment source. */
  balance: number;
};

export type PayRunFormProps = {
  cashCurrency: string;
  /** Used when no bank accounts are available (fresh demo DB) — falls back
   * to GL account 1000. Otherwise zero. */
  fallbackCash: number;
  bankAccounts: PayRunBankOption[];
  defaultBankAccountId: string | null;
  defaultPaymentDate: string;
  groups: PayRunRegionGroup[];
  totalBills: number;
};

/**
 * AP Pay Run form — live "cash before / after" math driven by the row
 * checkbox state, plus a single server action that loops the selection
 * through `recordBillPayment` server-side.
 */
export function PayRunForm({
  cashCurrency,
  fallbackCash,
  bankAccounts,
  defaultBankAccountId,
  defaultPaymentDate,
  groups,
  totalBills,
}: PayRunFormProps) {
  // Selected bill ids — start empty. The big "Pay X bills" tile reads this.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Bank account the user is paying from. Drives the "Cash on hand" tile
  // (showing this single account's balance, not a sum across accounts) and
  // is the account the server action debits when payments are recorded.
  const [bankAccountId, setBankAccountId] = useState<string>(
    defaultBankAccountId ?? "",
  );

  const banksById = useMemo(() => {
    const m = new Map<string, PayRunBankOption>();
    for (const b of bankAccounts) m.set(b.id, b);
    return m;
  }, [bankAccounts]);

  const activeBank = bankAccountId ? banksById.get(bankAccountId) ?? null : null;
  const cashOnHand = activeBank ? activeBank.balance : fallbackCash;
  const cashLabel = activeBank
    ? `${activeBank.name}${
        activeBank.lastFour ? ` ··${activeBank.lastFour}` : ""
      } · ${activeBank.currencyCode}`
    : bankAccounts.length === 0
      ? "GL cash (no bank accounts)"
      : "Select a bank account to see cash on hand";

  // Index of bill-id → balance, for the live total. Built once; bills are
  // stable for the life of this client component.
  const balanceById = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) {
      for (const b of g.bills) m.set(b.id, parseAmount(b.balanceDue));
    }
    return m;
  }, [groups]);

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const id of selected) sum += balanceById.get(id) ?? 0;
    return sum;
  }, [selected, balanceById]);

  const afterPayment = cashOnHand - selectedTotal;
  const insufficient = selectedTotal > 0 && afterPayment < 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(g: PayRunRegionGroup, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const b of g.bills) {
        if (on) next.add(b.id);
        else next.delete(b.id);
      }
      return next;
    });
  }

  const fmtCompact = (n: number) =>
    `${cashCurrency} ${formatAmount(n, { paren: true, compact: true })}`;

  return (
    <>
      {/* Top-of-page bank selector — drives the Cash on hand tile and is
          the account the server action debits when payments run. */}
      <div className="px-6 pb-3">
        <div
          className="rounded-lg px-3.5 py-3 flex items-center gap-4 flex-wrap"
          style={{
            background: "var(--raised)",
            border: "1px solid var(--line)",
          }}
        >
          <label className="flex flex-col gap-1">
            <span
              className="text-[10.5px] uppercase font-semibold"
              style={{ color: "var(--ink-4)", letterSpacing: "0.08em" }}
            >
              Pay from
            </span>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.currentTarget.value)}
              className="px-2.5 py-1.5 text-[13px] rounded-md outline-none"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line-2)",
                color: "var(--ink)",
                minWidth: 280,
              }}
              aria-label="Bank account to pay from"
            >
              {bankAccounts.length === 0 && (
                <option value="">— No bank accounts —</option>
              )}
              {bankAccounts.length > 0 && (
                <option value="">— Select bank account —</option>
              )}
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.name}
                  {ba.lastFour ? ` ··${ba.lastFour}` : ""} · {ba.currencyCode} ·{" "}
                  {formatAmount(ba.balance, { paren: true, compact: true })}
                </option>
              ))}
            </select>
          </label>
          <div
            className="text-[11.5px]"
            style={{ color: "var(--ink-3)", maxWidth: 320 }}
          >
            The selected account's balance drives <strong>Cash on hand</strong>{" "}
            and is the account debited when payments are recorded.
          </div>
        </div>
      </div>

      {/* Cash status tiles */}
      <div className="px-6 pb-3">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <KpiTile
            label="Cash on hand"
            value={fmtCompact(cashOnHand)}
            subtitle={cashLabel}
          />
          <KpiTile
            label="Selected to pay"
            value={fmtCompact(selectedTotal)}
            subtitle={`${selected.size} of ${totalBills} bill${
              totalBills === 1 ? "" : "s"
            } selected`}
          />
          <KpiTile
            label="Cash after payment"
            value={fmtCompact(afterPayment)}
            subtitle={
              insufficient ? (
                <span
                  style={{
                    background: "var(--p-review-bg)",
                    color: "var(--p-review-fg)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  Insufficient funds
                </span>
              ) : (
                "After the selected bills clear"
              )
            }
            neg={afterPayment < 0}
          />
        </div>
      </div>

      <form action={runPaymentsAction}>
        {/* Hidden inputs carrying selected bill ids. The server action reads
            `formData.getAll("billIds")`. */}
        {Array.from(selected).map((id) => (
          <input key={id} type="hidden" name="billIds" value={id} />
        ))}
        {/* Bank account is picked in the top-of-page selector; mirror its
            value through a hidden input so the server action receives it. */}
        <input type="hidden" name="bankAccountId" value={bankAccountId} />

        <div className="px-6 pb-24 flex flex-col gap-3">
          {groups.map((g) => {
            const groupSelectedCount = g.bills.filter((b) =>
              selected.has(b.id),
            ).length;
            const groupTotal = g.bills.reduce(
              (s, b) => s + parseAmount(b.balanceDue),
              0,
            );
            const allOn =
              g.bills.length > 0 && groupSelectedCount === g.bills.length;
            return (
              <Card
                key={g.regionId}
                title={
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={(e) => toggleGroup(g, e.currentTarget.checked)}
                      aria-label={`Select all bills in ${g.regionName}`}
                    />
                    <span>{g.regionName}</span>
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--ink-4)" }}
                    >
                      · {g.bills.length} bill
                      {g.bills.length === 1 ? "" : "s"} ·{" "}
                      {formatAmount(groupTotal, {
                        paren: true,
                        compact: true,
                      })}{" "}
                      {cashCurrency}
                    </span>
                  </span>
                }
              >
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH style={{ width: 28 }}>{""}</TH>
                      <TH>Bill #</TH>
                      <TH>Vendor</TH>
                      <TH>Bill date</TH>
                      <TH>Due date</TH>
                      <TH>Status</TH>
                      <TH num>Days past due</TH>
                      <TH num>Balance ({cashCurrency})</TH>
                      <TH>Firm entity</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {g.bills.map((b) => {
                      const checked = selected.has(b.id);
                      const overdue = b.daysPastDue > 0;
                      return (
                        <TR key={b.id} hover>
                          <TD>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(b.id)}
                              aria-label={`Select bill ${b.billNumber}`}
                            />
                          </TD>
                          <TD mono>
                            <Link
                              href={`/bills/${b.id}`}
                              style={{
                                color: "var(--ink)",
                                textDecoration: "none",
                              }}
                            >
                              {b.billNumber}
                            </Link>
                          </TD>
                          <TD>{b.vendorName}</TD>
                          <TD>{formatDate(b.billDate)}</TD>
                          <TD>{formatDate(b.dueDate)}</TD>
                          <TD>
                            <Pill variant={statusVariant(b.status)}>
                              {statusLabel(b.status)}
                            </Pill>
                          </TD>
                          <TD num neg={overdue}>
                            {overdue ? b.daysPastDue : "—"}
                          </TD>
                          <TD num>
                            <DrillNumber
                              value={b.balanceDue}
                              href={`/bills/${b.id}`}
                              currencyCode={null}
                            />
                          </TD>
                          <TD mono>{b.firmCode ?? "—"}</TD>
                        </TR>
                      );
                    })}
                    <TR total hover={false}>
                      <TD>{""}</TD>
                      <TD>Subtotal</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD num>
                        {formatMoney(groupTotal, cashCurrency, {
                          paren: true,
                          compact: true,
                          hideCurrency: true,
                        })}
                      </TD>
                      <TD>{""}</TD>
                    </TR>
                  </TBody>
                </Table>
              </Card>
            );
          })}
        </div>

        {/* Sticky footer action bar */}
        <div
          className="fixed bottom-0 left-0 right-0 px-6 py-3"
          style={{
            background: "var(--rail)",
            borderTop: "1px solid var(--line)",
            zIndex: 30,
          }}
        >
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  Pay from
                </span>
                <div
                  className="px-2.5 py-1.5 text-[13px] rounded-md"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    color: activeBank ? "var(--ink)" : "var(--ink-4)",
                    minWidth: 220,
                  }}
                >
                  {activeBank
                    ? `${activeBank.name}${
                        activeBank.lastFour ? ` ··${activeBank.lastFour}` : ""
                      }`
                    : "No bank account selected"}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span
                  className="text-[11.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  Payment date
                </span>
                <input
                  type="date"
                  name="paymentDate"
                  defaultValue={defaultPaymentDate}
                  required
                  className="px-2.5 py-1.5 text-[13px] rounded-md outline-none"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    color: "var(--ink)",
                  }}
                />
              </label>
            </div>
            <div className="flex flex-col items-end gap-1">
              {insufficient && (
                <span
                  className="text-[11.5px]"
                  style={{ color: "var(--p-review-fg)" }}
                >
                  Selected payments exceed cash on hand.
                </span>
              )}
              <Button
                type="submit"
                variant="primary"
                disabled={
                  selected.size === 0 ||
                  insufficient ||
                  (bankAccounts.length > 0 && !bankAccountId)
                }
                style={
                  selected.size === 0 ||
                  insufficient ||
                  (bankAccounts.length > 0 && !bankAccountId)
                    ? { opacity: 0.5, cursor: "not-allowed" }
                    : undefined
                }
              >
                Pay {selected.size} bill
                {selected.size === 1 ? "" : "s"} ·{" "}
                {formatAmount(selectedTotal, { paren: true, compact: true })}{" "}
                {cashCurrency}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

function KpiTile({
  label,
  value,
  subtitle,
  neg,
}: {
  label: string;
  value: string;
  subtitle: React.ReactNode;
  neg?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{
        background: "var(--raised)",
        border: "1px solid var(--line)",
      }}
    >
      <div
        className="text-[10.5px] uppercase font-semibold"
        style={{ color: "var(--ink-4)", letterSpacing: "0.08em" }}
      >
        {label}
      </div>
      <div
        className="mt-1.5"
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 22,
          fontWeight: 600,
          color: neg ? "var(--danger, #b42318)" : "var(--ink)",
        }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[11.5px]"
        style={{ color: "var(--ink-3)" }}
      >
        {subtitle}
      </div>
    </div>
  );
}
