import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import type { SubledgerReconciliation } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

/**
 * GL tie-out card for the AR / AP aging reports: subledger total, control
 * account balance at the current firm scope, and the difference — green
 * when it ties to 0.00, red otherwise.
 *
 * UNITS: the GL books document postings in native currency (payments too,
 * with no fx snapshot), so the tie-out compares RAW NATIVE sums on both
 * sides (control balance vs Σ open balanceDue). Base-converted figures
 * are shown for context only.
 */
export function GlTieOut({
  recon,
  subledgerLabel,
}: {
  recon: SubledgerReconciliation;
  subledgerLabel: string;
}) {
  const ties = recon.difference === 0;
  const tone = ties ? "var(--p-active-fg)" : "var(--p-review-fg)";
  const toneBg = ties ? "var(--p-active-bg)" : "var(--p-review-bg)";
  const controlLabel = recon.controlAccountCode
    ? `${recon.controlAccountCode} — ${recon.controlAccountName}`
    : "control account not found";

  const tile = (label: string, body: React.ReactNode, sub?: React.ReactNode) => (
    <div
      className="flex-1 rounded-md px-4 py-3"
      style={{ background: "var(--rail)", border: "1px solid var(--line)" }}
    >
      <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
      <div
        className="text-[22px] font-semibold mt-1"
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--ink)",
        }}
      >
        {body}
      </div>
      {sub != null && (
        <div className="text-[11.5px] mt-1" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      )}
    </div>
  );

  const multiCurrency = recon.subledgerByCurrency.length > 1;

  return (
    <Card title="GL tie-out · subledger vs control account (native GL units)" bodyPadding>
      <div className="flex flex-col md:flex-row md:items-stretch gap-4">
        {tile(
          subledgerLabel,
          formatMoney(recon.subledgerTotalNative, null, {
            compact: true,
            paren: true,
            hideCurrency: true,
          }),
          <>
            {multiCurrency && (
              <div>
                Native GL units summed across currencies — same units as the
                control account
              </div>
            )}
            {recon.subledgerByCurrency.map((c) => (
              <div key={c.currencyCode}>
                {formatMoney(c.native, c.currencyCode, {
                  compact: true,
                  paren: true,
                })}{" "}
                ({c.docCount} doc{c.docCount === 1 ? "" : "s"}) ≈{" "}
                {formatMoney(c.base, recon.baseCurrencyCode, {
                  compact: true,
                  paren: true,
                })}
              </div>
            ))}
            <div>
              ≈{" "}
              {formatMoney(recon.subledgerTotalBase, recon.baseCurrencyCode, {
                compact: true,
                paren: true,
              })}{" "}
              total (display only)
            </div>
            {recon.unpostedCount > 0 && (
              <div style={{ color: "var(--p-pending-fg)" }}>
                {recon.unpostedCount} unposted draft
                {recon.unpostedCount === 1 ? "" : "s"} excluded (not in the GL
                yet)
              </div>
            )}
          </>,
        )}
        {tile(
          `Control account balance (${controlLabel})`,
          formatMoney(recon.controlBalance, null, {
            compact: true,
            paren: true,
            hideCurrency: true,
          }),
          `As of ${recon.asOf} at the current firm scope · raw GL (native) units`,
        )}
        <div
          className="flex-1 rounded-md px-4 py-3"
          style={{ background: toneBg, border: `1px solid ${tone}` }}
        >
          <div
            className="text-[11.5px] flex items-center gap-1.5"
            style={{ color: tone }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: tone }}
            />
            {ties
              ? "Control ties to subledger"
              : "Difference (control − subledger, native GL units)"}
          </div>
          <div
            className="text-[22px] font-semibold mt-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: tone,
            }}
          >
            {formatMoney(recon.difference, null, {
              paren: true,
              hideCurrency: true,
            })}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: tone }}>
            {ties
              ? "0.00 — nothing to chase"
              : `${recon.reconcilingItems.length} reconciling item${recon.reconcilingItems.length === 1 ? "" : "s"} listed below`}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Reconciling items: posted journal lines hitting the control account that
 * did NOT come from the invoice / bill / payment pipeline (direct manual
 * postings, adjustments, eliminations at all-scope). Their sum should
 * explain the tie-out difference; any remainder is highlighted red.
 */
export function ReconcilingItemsCard({
  recon,
}: {
  recon: SubledgerReconciliation;
}) {
  if (recon.reconcilingItems.length === 0 && recon.unexplainedDifference === 0) {
    return null;
  }
  const unexplainedTone =
    recon.unexplainedDifference === 0
      ? "var(--p-active-fg)"
      : "var(--p-review-fg)";
  return (
    <Card
      title={`Reconciling items · non-pipeline postings on ${recon.controlAccountCode ?? "the control account"}`}
    >
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Date</TH>
            <TH>Entry #</TH>
            <TH>Description</TH>
            <TH num>Amount (native GL units)</TH>
          </TR>
        </THead>
        <TBody>
          {recon.reconcilingItems.length === 0 && (
            <TR hover={false}>
              <TD colSpan={4} style={{ color: "var(--ink-3)" }}>
                No non-pipeline postings hit the control account.
              </TD>
            </TR>
          )}
          {recon.reconcilingItems.map((item) => (
            <TR key={item.entryId} hover={false}>
              <TD>{formatDate(item.entryDate)}</TD>
              <TD mono>
                <Link
                  href={`/journal/${item.entryNumber}`}
                  style={{ color: "var(--ink)", textDecoration: "none" }}
                >
                  {item.entryNumber}
                </Link>
              </TD>
              <TD>{item.description || "—"}</TD>
              <TD num neg={item.amount < 0}>
                {formatMoney(item.amount, null, {
                  paren: true,
                  hideCurrency: true,
                })}
              </TD>
            </TR>
          ))}
          <TR total hover={false}>
            <TD colSpan={3}>Reconciling items total</TD>
            <TD num>
              {formatMoney(recon.reconcilingTotal, null, {
                paren: true,
                hideCurrency: true,
              })}
            </TD>
          </TR>
          <TR total hover={false}>
            <TD colSpan={3}>
              <span style={{ color: unexplainedTone }}>
                Unexplained difference (difference − reconciling items)
              </span>
            </TD>
            <TD num>
              <span
                style={{
                  color: unexplainedTone,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatMoney(recon.unexplainedDifference, null, {
                  paren: true,
                  hideCurrency: true,
                })}
              </span>
            </TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}
