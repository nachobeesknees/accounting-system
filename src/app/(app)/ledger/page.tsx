import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getAccounts, getJournalEntries } from "@/lib/data";
import { formatMoney, parseAmount } from "@/lib/money";

function formatRowDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const params = await searchParams;
  const [accounts, allEntries] = await Promise.all([
    getAccounts(),
    getJournalEntries(),
  ]);
  const defaultCode = accounts[0]?.code ?? "";
  const selectedCode = params.account ?? defaultCode;
  const account =
    accounts.find((a) => a.code === selectedCode) ?? accounts[0];

  type Row = {
    key: string;
    date: string;
    entryNumber: string;
    description: string;
    debit: number;
    credit: number;
    running: number;
  };

  const rows: Row[] = [];
  let running = 0;
  if (account) {
    const sign = account.normalBalance === "debit" ? 1 : -1;
    const entries = allEntries
      .filter((e) => e.status === "posted")
      .slice()
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    for (const e of entries) {
      for (const line of e.lines) {
        if (line.accountId !== account.id) continue;
        const debit = parseAmount(line.debit);
        const credit = parseAmount(line.credit);
        running += (debit - credit) * sign;
        rows.push({
          key: line.id,
          date: e.entryDate,
          entryNumber: e.entryNumber,
          description: line.description ?? e.description ?? "",
          debit,
          credit,
          running,
        });
      }
    }
  }

  const closing = running;

  return (
    <>
      <PageHeader
        title="General Ledger"
        meta="All posted activity for the selected account"
      />

      <div
        className="px-6 py-2 flex items-end justify-between gap-4 flex-wrap"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex items-end gap-2">
          <SmartSelectField
            label="Account"
            name="account"
            defaultValue={account?.code ?? ""}
            options={accounts.map((a) => ({
              value: a.code,
              label: `${a.code} — ${a.name}`,
              search: a.code,
            }))}
          />
          <Button variant="primary" type="submit">
            Apply
          </Button>
        </form>

        {account && (
          <div
            className="text-[12.5px] flex gap-3 items-center"
            style={{ color: "var(--ink-3)" }}
          >
            <span>
              Normal balance:{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink)",
                }}
              >
                {account.normalBalance}
              </span>
            </span>
            <span style={{ color: "var(--ink-4)" }}>·</span>
            <span>
              Closing:{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: closing < 0 ? "var(--p-review-fg)" : "var(--ink)",
                }}
              >
                {formatMoney(closing, "USD", { paren: true, compact: true })}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card
          title={
            account ? (
              <span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink)",
                  }}
                >
                  {account.code}
                </span>{" "}
                — {account.name}
              </span>
            ) : (
              "Ledger"
            )
          }
        >
          {rows.length === 0 ? (
            <Empty
              title="No posted activity"
              body="This account has no posted journal lines yet."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Entry #</TH>
                  <TH>Description</TH>
                  <TH num>Debit</TH>
                  <TH num>Credit</TH>
                  <TH num>Running balance</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.key} href={`/journal/${r.entryNumber}`}>
                    <TD>{formatRowDate(r.date)}</TD>
                    <TD mono>
                      <Link
                        href={`/journal/${r.entryNumber}`}
                        style={{
                          color: "var(--ink)",
                          textDecoration: "none",
                        }}
                      >
                        {r.entryNumber}
                      </Link>
                    </TD>
                    <TD>{r.description}</TD>
                    {/* Per-line GL postings keep cents — accounting precision
                        matters here, same as the JE detail page. The closing
                        / opening totals above and below stay compact. */}
                    <TD num>
                      {r.debit === 0 ? "—" : formatMoney(r.debit, "USD")}
                    </TD>
                    <TD num>
                      {r.credit === 0 ? "—" : formatMoney(r.credit, "USD")}
                    </TD>
                    <TD num neg={r.running < 0}>
                      {formatMoney(r.running, "USD", { paren: true })}
                    </TD>
                  </TR>
                ))}
                <TR total hover={false}>
                  <TD
                    colSpan={5}
                    style={{
                      fontWeight: 600,
                      color: "var(--ink)",
                    }}
                  >
                    Closing balance
                  </TD>
                  <TD num neg={closing < 0}>
                    {formatMoney(closing, "USD", { paren: true, compact: true })}
                  </TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
