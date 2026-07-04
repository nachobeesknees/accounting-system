import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import {
  getBaseCurrency,
  getBills,
  getFirmEntities,
  getInvoices,
  getTaxCodes,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { buildVatReturn, type VatCodeRow } from "@/lib/vat";
import { taxKindLabel } from "@/lib/tax";

function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getUTCFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function kindPill(kind: VatCodeRow["kind"]) {
  if (kind === "exempt") return <Pill variant="review">Exempt (separate)</Pill>;
  if (kind === "zero_rated") return <Pill variant="pending">Zero-rated</Pill>;
  if (kind === "out_of_scope") return <Pill variant="neutral">Out of scope</Pill>;
  if (kind === "untaxed") return <Pill variant="neutral">Untaxed</Pill>;
  return <Pill variant="active">{taxKindLabel(kind)}</Pill>;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; firm?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const def = defaultWindow();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const firmEntityId = sp.firm && sp.firm !== "" ? sp.firm : null;

  const [invoices, bills, taxCodes, firms, base] = await Promise.all([
    getInvoices(),
    getBills(),
    getTaxCodes(),
    getFirmEntities(),
    getBaseCurrency(),
  ]);
  const baseCode = base?.code ?? "USD";

  const vat = buildVatReturn(invoices, bills, taxCodes, {
    from,
    to,
    firmEntityId,
  });

  const firmName =
    firms.find((f) => f.id === firmEntityId)?.name ?? "All firm entities";

  function codeTable(
    rows: VatCodeRow[],
    kind: "output" | "input",
  ) {
    const docBase = kind === "output" ? "/invoices" : "/bills";
    return (
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Code</TH>
            <TH>Name</TH>
            <TH>Treatment</TH>
            <TH num>Net</TH>
            <TH num>Tax</TH>
            <TH num>Docs</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TR hover={false}>
              <TD colSpan={6} style={{ color: "var(--ink-3)" }}>
                No {kind} activity in this window.
              </TD>
            </TR>
          )}
          {rows.map((r) => (
            <TR key={`${kind}-${r.taxCodeId ?? "untaxed"}`} hover={false}>
              <TD mono>{r.code}</TD>
              <TD>{r.name}</TD>
              <TD>{kindPill(r.kind)}</TD>
              <TD num>{formatMoney(r.net, baseCode, { compact: true, paren: true })}</TD>
              <TD num>{formatMoney(r.tax, baseCode, { compact: true, paren: true })}</TD>
              <TD num>
                <Link
                  href={docBase}
                  style={{ color: "var(--ink)", textDecoration: "none" }}
                  title="Open source documents"
                >
                  {r.docIds.length}
                </Link>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    );
  }

  return (
    <>
      <PageHeader
        title="VAT / GST return"
        meta={`${from} → ${to} · ${firmName}`}
        actions={
          <>
            <CsvDownloadButton report="vat" />
            <PrintButton />
          </>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end no-print"
        style={{ background: "var(--rail)", borderBottom: "1px solid var(--line)" }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="px-2 py-1 text-[12.5px] rounded"
              style={{
                background: "var(--raised)",
                border: "1px solid var(--line-2)",
                color: "var(--ink)",
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              To
            </span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="px-2 py-1 text-[12.5px] rounded"
              style={{
                background: "var(--raised)",
                border: "1px solid var(--line-2)",
                color: "var(--ink)",
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              Firm entity
            </span>
            <select
              name="firm"
              defaultValue={firmEntityId ?? ""}
              className="px-2 py-1 text-[12.5px] rounded"
              style={{
                background: "var(--raised)",
                border: "1px solid var(--line-2)",
                color: "var(--ink)",
              }}
            >
              <option value="">All firm entities</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
              border: "1px solid var(--accent)",
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          <ButtonLink variant="ghost" href="/reports/vat">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Tile
            label="Output tax (sales)"
            value={formatMoney(vat.outputTaxTotal, baseCode, { compact: true })}
          />
          <Tile
            label={vat.scopeMismatch ? "Input tax (bills · all firms)" : "Input tax (bills)"}
            value={formatMoney(vat.inputTaxTotal, baseCode, { compact: true })}
          />
          {vat.netPayable == null ? (
            <Tile
              label="Net VAT"
              value="n/a"
              hint="Bills aren't firm-scoped, so a per-firm net isn't meaningful. Clear the firm filter for the net figure."
            />
          ) : (
            <Tile
              label={vat.netPayable >= 0 ? "Net VAT payable" : "Net VAT refundable"}
              value={formatMoney(Math.abs(vat.netPayable), baseCode, { compact: true })}
              neg={vat.netPayable < 0}
            />
          )}
        </div>

        <Card title="Output tax — sales invoices by tax code">
          {codeTable(vat.output, "output")}
        </Card>

        <Card title="Input tax — bills by tax code">
          {codeTable(vat.input, "input")}
        </Card>

        <Card title="Non-net sales (reported separately, not netted)">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Category</TH>
                <TH num>Net sales</TH>
              </TR>
            </THead>
            <TBody>
              <TR hover={false}>
                <TD>Zero-rated sales</TD>
                <TD num>
                  {formatMoney(vat.zeroRatedSalesTotal, baseCode, {
                    compact: true,
                    paren: true,
                  })}
                </TD>
              </TR>
              <TR hover={false}>
                <TD>Exempt sales</TD>
                <TD num>
                  {formatMoney(vat.exemptSalesTotal, baseCode, {
                    compact: true,
                    paren: true,
                  })}
                </TD>
              </TR>
              <TR hover={false}>
                <TD>Out-of-scope sales</TD>
                <TD num>
                  {formatMoney(vat.outOfScopeSalesTotal, baseCode, {
                    compact: true,
                    paren: true,
                  })}
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  neg,
  hint,
}: {
  label: string;
  value: string;
  neg?: boolean;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div
        className="uppercase"
        style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}
      >
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 22,
          color: neg ? "var(--p-review-fg)" : "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1" style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "normal" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
