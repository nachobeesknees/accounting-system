import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Row, TextareaField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getBankAccountById, getStatementImports, getUsers } from "@/lib/data";
import { formatDate, maskAccountNumber } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

import { importStatementAction } from "./actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    imported?: string;
    skipped?: string;
    badrows?: string;
  }>;
}) {
  const { id } = await params;
  const { error, imported, skipped, badrows } = await searchParams;
  const [bank, user] = await Promise.all([
    getBankAccountById(id),
    getSessionUser(),
  ]);
  if (!bank) notFound();
  const canImport = hasPermission(user, "bank.import");

  const [imports, users] = await Promise.all([
    getStatementImports(bank.id),
    getUsers(),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const badRowCount = badrows ? parseInt(badrows, 10) || 0 : 0;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Bank accounts", href: "/bank" },
          { label: bank.name, href: `/bank/${bank.id}` },
          { label: "Import statement" },
        ]}
      />
      <PageHeader
        title="Import bank statement"
        meta={`${bank.name} ${maskAccountNumber(bank.accountNumber, bank.lastFour)} · ${bank.currencyCode}`}
        actions={
          <ButtonLink href={`/bank/${bank.id}`} variant="secondary">
            ← Account
          </ButtonLink>
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
        {imported != null && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Imported {imported} transaction{imported === "1" ? "" : "s"}, skipped{" "}
            {skipped ?? "0"} duplicate{skipped === "1" ? "" : "s"}.
            {badRowCount > 0 &&
              ` ${badRowCount} row${badRowCount === 1 ? "" : "s"} could not be parsed and ${badRowCount === 1 ? "was" : "were"} skipped.`}
          </div>
        )}
        {!canImport && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-pending-bg)",
              color: "var(--p-pending-fg)",
              border: "1px solid var(--p-pending-fg)",
            }}
          >
            Your role can't import statements (requires bank.import).
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="md:col-span-2">
            <form action={importStatementAction}>
              <input type="hidden" name="bankAccountId" value={bank.id} />
              <Card title="Upload or paste statement CSV">
                <div className="p-3.5 flex flex-col gap-3">
                  <Row>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        CSV file
                      </span>
                      <input
                        type="file"
                        name="file"
                        accept=".csv,text/csv"
                        className="text-[13px]"
                      />
                    </label>
                    <div />
                  </Row>
                  <TextareaField
                    label="…or paste CSV text"
                    name="pasted"
                    rows={6}
                    placeholder={"Date,Description,Amount,Reference\n2026-06-30,Wire — Acme,-1200.00,WIRE-1001"}
                    help="Used only when no file is chosen."
                  />
                  <div className="flex justify-end">
                    <Button variant="primary" type="submit" disabled={!canImport}>
                      Import statement
                    </Button>
                  </div>
                </div>
              </Card>
            </form>
          </div>

          <Card title="Accepted format">
            <div className="p-3.5 text-[12px] flex flex-col gap-2" style={{ color: "var(--ink-3)" }}>
              <div>
                Headers are matched case-insensitively. Required columns:
              </div>
              <div>
                <strong style={{ color: "var(--ink-2)" }}>Date</strong> — also
                Transaction/Posted/Value Date. ISO (2026-06-30) or US (6/30/2026).
              </div>
              <div>
                <strong style={{ color: "var(--ink-2)" }}>Description</strong> — also
                Memo, Details, Narrative, Payee.
              </div>
              <div>
                <strong style={{ color: "var(--ink-2)" }}>Amount</strong> — signed
                (deposits positive, outflows negative), or separate{" "}
                <strong style={{ color: "var(--ink-2)" }}>Debit</strong> /{" "}
                <strong style={{ color: "var(--ink-2)" }}>Credit</strong> columns
                (amount = credit − debit).
              </div>
              <div>
                <strong style={{ color: "var(--ink-2)" }}>Reference</strong> —
                optional; also Check Number, Transaction ID.
              </div>
              <div>
                Rows that already exist on this account — same date, amount and
                reference (or description) — are skipped as duplicates, so
                re-importing an overlapping statement is safe.
              </div>
            </div>
          </Card>
        </div>

        <Card title="Import history">
          {imports.length === 0 ? (
            <Empty
              title="No statements imported yet"
              body="Each import is recorded here with its row and duplicate counts."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>When</TH>
                  <TH>File</TH>
                  <TH>Imported by</TH>
                  <TH num>Imported</TH>
                  <TH num>Duplicates skipped</TH>
                </TR>
              </THead>
              <TBody>
                {imports.map((imp) => (
                  <TR key={imp.id}>
                    <TD>{formatDate(imp.createdAt.slice(0, 10))}</TD>
                    <TD mono style={{ color: "var(--ink-2)" }}>{imp.fileName}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      {imp.importedBy
                        ? usersById.get(imp.importedBy)?.fullName ?? imp.importedBy
                        : "—"}
                    </TD>
                    <TD num>{imp.rowCount}</TD>
                    <TD num style={{ color: "var(--ink-3)" }}>{imp.duplicateCount}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
