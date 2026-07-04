/**
 * VAT return aggregation shared by the /reports/vat page and its CSV route.
 * Groups sales-invoice output tax and bill input tax by tax code within a
 * date window and firm entity, keeping exempt / zero-rated / out-of-scope as
 * separate reported lines (exempt is NOT netted).
 */

import type { Bill, Invoice, TaxCode } from "./types";
import { parseAmount } from "./money";

export type VatCodeRow = {
  taxCodeId: string | null;
  code: string;
  name: string;
  kind: TaxCode["kind"] | "untaxed";
  /** Net (line amount) base for the code. */
  net: number;
  /** Tax amount for the code. */
  tax: number;
  /** Source document ids for drill-down. */
  docIds: string[];
};

export type VatReturn = {
  output: VatCodeRow[]; // sales invoices
  input: VatCodeRow[]; // bills
  outputTaxTotal: number;
  inputTaxTotal: number;
  /**
   * output − input (positive = payable, negative = refund), but ONLY when
   * output and input share the same firm scope. When a firm entity is
   * selected, output tax is firm-scoped yet input tax cannot be (bills carry
   * no firm on the header), so the two totals live in different scopes and a
   * net remittance figure would be meaningless — it is `null` in that case.
   */
  netPayable: number | null;
  /** True when output tax is firm-scoped but input tax is all-firms. */
  scopeMismatch: boolean;
  exemptSalesTotal: number;
  zeroRatedSalesTotal: number;
  outOfScopeSalesTotal: number;
};

function withinWindow(dateIso: string, from: string, to: string): boolean {
  return dateIso >= from && dateIso <= to;
}

/**
 * Build the VAT return. Only POSTED (non-draft, non-void) documents count.
 * Credit memos / vendor credits carry negative amounts and net correctly.
 */
export function buildVatReturn(
  invoices: Invoice[],
  bills: Bill[],
  taxCodes: TaxCode[],
  opts: { from: string; to: string; firmEntityId: string | null },
): VatReturn {
  const codeById = new Map(taxCodes.map((c) => [c.id, c] as const));

  const outputMap = new Map<string, VatCodeRow>();
  const inputMap = new Map<string, VatCodeRow>();

  function bump(
    map: Map<string, VatCodeRow>,
    taxCodeId: string | null,
    net: number,
    tax: number,
    docId: string,
  ) {
    const key = taxCodeId ?? "__untaxed__";
    const code = taxCodeId ? codeById.get(taxCodeId) : undefined;
    const row =
      map.get(key) ??
      ({
        taxCodeId,
        code: code?.code ?? "—",
        name: code?.name ?? "Untaxed / legacy",
        kind: (code?.kind ?? "untaxed") as VatCodeRow["kind"],
        net: 0,
        tax: 0,
        docIds: [],
      } as VatCodeRow);
    row.net += net;
    row.tax += tax;
    if (!row.docIds.includes(docId)) row.docIds.push(docId);
    map.set(key, row);
  }

  for (const inv of invoices) {
    if (inv.status === "draft" || inv.status === "void" || inv.isTemplate) continue;
    if (!withinWindow(inv.invoiceDate, opts.from, opts.to)) continue;
    const firm = inv.firmEntityId ?? null;
    if (opts.firmEntityId && firm !== opts.firmEntityId) continue;
    // Does this invoice use per-line tax codes at all?
    const usesLineCodes = inv.lines.some((l) => l.taxCodeId != null);
    for (const l of inv.lines) {
      const net = parseAmount(l.amount);
      const tax = parseAmount(l.taxAmount ?? "0");
      bump(outputMap, l.taxCodeId ?? null, net, tax, inv.id);
    }
    // Legacy invoice-level tax (no per-line codes): its header taxAmount is
    // real output VAT that no line carries, so add it to the untaxed bucket.
    if (!usesLineCodes) {
      const headerTax = parseAmount(inv.taxAmount);
      if (Math.abs(headerTax) > 0.005) {
        bump(outputMap, null, 0, headerTax, inv.id);
      }
    }
  }

  for (const bill of bills) {
    if (bill.status === "draft" || bill.status === "void") continue;
    if (!withinWindow(bill.billDate, opts.from, opts.to)) continue;
    // Bills don't carry firmEntityId on the header type, so input tax cannot
    // be firm-scoped here. When a firm filter is active this means input tax
    // stays all-firms while output tax is firm-scoped — see scopeMismatch /
    // netPayable below.
    for (const l of bill.lines) {
      const net = parseAmount(l.amount);
      const tax = parseAmount(l.taxAmount ?? "0");
      bump(inputMap, l.taxCodeId ?? null, net, tax, bill.id);
    }
  }

  const output = Array.from(outputMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const input = Array.from(inputMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const outputTaxTotal = output.reduce((s, r) => s + r.tax, 0);
  const inputTaxTotal = input.reduce((s, r) => s + r.tax, 0);
  const exemptSalesTotal = output
    .filter((r) => r.kind === "exempt")
    .reduce((s, r) => s + r.net, 0);
  const zeroRatedSalesTotal = output
    .filter((r) => r.kind === "zero_rated")
    .reduce((s, r) => s + r.net, 0);
  const outOfScopeSalesTotal = output
    .filter((r) => r.kind === "out_of_scope")
    .reduce((s, r) => s + r.net, 0);

  // With a firm filter, output is firm-scoped but input is all-firms, so the
  // two totals are not comparable — suppress the net figure rather than
  // subtracting one firm's output from every firm's input.
  const scopeMismatch = opts.firmEntityId != null;

  return {
    output,
    input,
    outputTaxTotal: round2(outputTaxTotal),
    inputTaxTotal: round2(inputTaxTotal),
    netPayable: scopeMismatch ? null : round2(outputTaxTotal - inputTaxTotal),
    scopeMismatch,
    exemptSalesTotal: round2(exemptSalesTotal),
    zeroRatedSalesTotal: round2(zeroRatedSalesTotal),
    outOfScopeSalesTotal: round2(outOfScopeSalesTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
