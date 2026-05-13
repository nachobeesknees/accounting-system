import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { Field, SelectField } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { getJournalEntries, totalDebits } from "@/lib/data";
import { formatUSD } from "@/lib/money";
import type { JournalEntry } from "@/lib/types";

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function filterEntries(
  entries: JournalEntry[],
  q: string,
  status: string,
  source: string,
): JournalEntry[] {
  const needle = q.trim().toLowerCase();
  return entries.filter((e) => {
    if (status && e.status !== status) return false;
    if (source && e.source !== source) return false;
    if (needle) {
      const hay =
        `${e.entryNumber} ${e.description ?? ""} ${e.reference ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const source = params.source ?? "";

  const allEntries = getJournalEntries();
  const entries = filterEntries(allEntries, q, status, source);
  const grandTotal = entries.reduce((s, e) => s + totalDebits(e), 0);

  return (
    <>
      <PageHeader
        title="Journal Entries"
        meta={`${allEntries.length} entries this period`}
        actions={
          <ButtonLink variant="primary" href="/journal/new">
            + New entry
          </ButtonLink>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          <Field
            label="Search"
            name="q"
            placeholder="Search description, reference, or entry #"
            defaultValue={q}
          />
          <SelectField label="Status" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
            <option value="void">Void</option>
          </SelectField>
          <SelectField label="Source" name="source" defaultValue={source}>
            <option value="">All</option>
            <option value="manual">Manual</option>
            <option value="invoice">Invoice</option>
            <option value="bill">Bill</option>
            <option value="reconciliation">Reconciliation</option>
          </SelectField>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/journal">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Entries">
          {entries.length === 0 ? (
            <Empty
              title="No journal entries match these filters"
              body="Try clearing the filters or create a new entry."
              cta={
                <ButtonLink variant="primary" href="/journal/new">
                  + New entry
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Entry #</TH>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Reference</TH>
                  <TH>Source</TH>
                  <TH>Status</TH>
                  <TH num>Total</TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD mono>
                      <Link
                        href={`/journal/${e.entryNumber}`}
                        style={{
                          color: "var(--ink)",
                          textDecoration: "none",
                        }}
                      >
                        {e.entryNumber}
                      </Link>
                    </TD>
                    <TD>{formatShortDate(e.entryDate)}</TD>
                    <TD>{e.description ?? "—"}</TD>
                    <TD
                      mono
                      style={{ color: "var(--ink-3)" }}
                    >
                      {e.reference ?? "—"}
                    </TD>
                    <TD
                      style={{
                        color: "var(--ink-3)",
                        fontSize: 11.5,
                        textTransform: "capitalize",
                      }}
                    >
                      {e.source}
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(e.status)}>
                        {statusLabel(e.status)}
                      </Pill>
                    </TD>
                    <TD num>{formatUSD(totalDebits(e))}</TD>
                  </TR>
                ))}
                <TR total hover={false}>
                  <TD>Total</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD num>{formatUSD(grandTotal)}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
