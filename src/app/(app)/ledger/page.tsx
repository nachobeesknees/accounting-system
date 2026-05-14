import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { DEMO_TODAY, getAccounts, getJournalEntries } from "@/lib/data";
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

/**
 * Build a /ledger href that mutates the current filter state. Pure
 * server-side — each chip's "remove" link computes its own destination
 * URL with the removed account dropped from the list. Lets the page
 * stay a server component without a client picker.
 */
function buildLedgerHref(opts: {
  accounts: string[];
  from?: string;
  to?: string;
}): string {
  const qs = new URLSearchParams();
  if (opts.accounts.length) qs.set("accounts", opts.accounts.join(","));
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  const q = qs.toString();
  return q ? `/ledger?${q}` : "/ledger";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    /** Legacy single-account param — still honoured. */
    account?: string;
    /** Comma-separated list of account codes for multi-account view. */
    accounts?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const [accounts, allEntries] = await Promise.all([
    getAccounts(),
    getJournalEntries(),
  ]);

  // ---- Parse filter state ------------------------------------------------
  // Backwards compat: `?account=1000` still works alongside the new
  // `?accounts=1000,1100` syntax. The combined list dedups + drops
  // anything we don't have a matching account row for.
  const requestedCodes = new Set<string>();
  if (params.account) requestedCodes.add(params.account);
  if (params.accounts) {
    for (const c of params.accounts.split(",")) {
      const trimmed = c.trim();
      if (trimmed) requestedCodes.add(trimmed);
    }
  }
  // Default to the first account when no filter is set, so the page
  // doesn't render empty on first visit.
  if (requestedCodes.size === 0 && accounts[0]) {
    requestedCodes.add(accounts[0].code);
  }

  const selectedAccounts = accounts.filter((a) => requestedCodes.has(a.code));
  const selectedCodes = selectedAccounts.map((a) => a.code);
  const selectedAccountIds = new Set(selectedAccounts.map((a) => a.id));

  const from = params.from ?? "";
  const to = params.to ?? "";

  // ---- Build rows --------------------------------------------------------
  type Row = {
    key: string;
    date: string;
    entryNumber: string;
    description: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    running: number;
  };

  const rows: Row[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let netRunning = 0;

  if (selectedAccounts.length > 0) {
    // Per-account running balance keyed by account.id, so the running
    // column makes sense even when multiple accounts are visible.
    const runningByAccount = new Map<string, number>();
    const signByAccount = new Map(
      selectedAccounts.map((a) => [a.id, a.normalBalance === "debit" ? 1 : -1]),
    );
    const accountById = new Map(selectedAccounts.map((a) => [a.id, a]));

    const entries = allEntries
      .filter((e) => e.status === "posted")
      .filter((e) => !from || e.entryDate >= from)
      .filter((e) => !to || e.entryDate <= to)
      .slice()
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    for (const e of entries) {
      for (const line of e.lines) {
        if (!selectedAccountIds.has(line.accountId)) continue;
        const a = accountById.get(line.accountId)!;
        const sign = signByAccount.get(line.accountId) ?? 1;
        const debit = parseAmount(line.debit);
        const credit = parseAmount(line.credit);
        const prev = runningByAccount.get(line.accountId) ?? 0;
        const running = prev + (debit - credit) * sign;
        runningByAccount.set(line.accountId, running);
        totalDebit += debit;
        totalCredit += credit;
        netRunning += (debit - credit) * sign;
        rows.push({
          key: line.id,
          date: e.entryDate,
          entryNumber: e.entryNumber,
          description: line.description ?? e.description ?? "",
          accountCode: a.code,
          accountName: a.name,
          debit,
          credit,
          running,
        });
      }
    }
  }

  const todayIso = DEMO_TODAY.toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="General Ledger"
        meta={
          selectedAccounts.length === 0
            ? "Pick an account to view its activity"
            : selectedAccounts.length === 1
              ? `Activity for ${selectedAccounts[0].code} — ${selectedAccounts[0].name}`
              : `Activity across ${selectedAccounts.length} accounts`
        }
      />

      <div
        className="px-6 py-3 flex flex-col gap-2"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {/* Filter form: pick another account to add, set date range. */}
        <form method="GET" className="flex items-end gap-2 flex-wrap">
          {/* Carry over existing selections + dates as hidden inputs so the
              form submit appends rather than replaces. The "Add" submit
              merges the picker value into the accounts list. */}
          <input
            type="hidden"
            name="accounts"
            value={selectedCodes.join(",")}
          />
          <SmartSelectField
            label="+ Add account"
            name="account"
            options={accounts
              .filter((a) => !requestedCodes.has(a.code))
              .map((a) => ({
                value: a.code,
                label: `${a.code} — ${a.name}`,
                search: a.code,
              }))}
          />
          <Field label="From" name="from" type="date" defaultValue={from} />
          <Field label="To" name="to" type="date" defaultValue={to || todayIso} />
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/ledger">
            Reset
          </ButtonLink>
        </form>

        {/* Selected accounts as removable chips */}
        {selectedAccounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--ink-3)" }}
            >
              Accounts:
            </span>
            {selectedAccounts.map((a) => {
              const remaining = selectedCodes.filter((c) => c !== a.code);
              const removeHref = buildLedgerHref({
                accounts: remaining,
                from,
                to,
              });
              return (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px]"
                  style={{
                    background: "var(--p-formation-bg)",
                    color: "var(--p-formation-fg)",
                    border: "1px solid var(--p-formation-fg)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {a.code}
                  </span>
                  <span style={{ opacity: 0.75 }}>{a.name}</span>
                  <Link
                    href={removeHref}
                    aria-label={`Remove ${a.code}`}
                    style={{
                      color: "inherit",
                      textDecoration: "none",
                      marginLeft: 2,
                      fontWeight: 600,
                      opacity: 0.7,
                    }}
                  >
                    ×
                  </Link>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card
          title={
            selectedAccounts.length === 1 ? (
              <span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink)",
                  }}
                >
                  {selectedAccounts[0].code}
                </span>{" "}
                — {selectedAccounts[0].name}
              </span>
            ) : selectedAccounts.length > 1 ? (
              `${selectedAccounts.length} accounts`
            ) : (
              "Ledger"
            )
          }
        >
          {rows.length === 0 ? (
            <Empty
              title="No posted activity"
              body={
                selectedAccounts.length === 0
                  ? "Pick at least one account above to see ledger activity."
                  : "No posted journal lines match the current filters."
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Entry #</TH>
                  {/* Account column only adds value when filtering >1 account. */}
                  {selectedAccounts.length > 1 && <TH>Account</TH>}
                  <TH>Description</TH>
                  <TH num>Debit</TH>
                  <TH num>Credit</TH>
                  <TH num>Running</TH>
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
                    {selectedAccounts.length > 1 && (
                      <TD mono style={{ color: "var(--ink-3)" }}>
                        {r.accountCode}
                      </TD>
                    )}
                    <TD>{r.description}</TD>
                    {/* Per-line GL postings keep cents — accounting precision
                        matters here, same as the JE detail page. */}
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
                    colSpan={selectedAccounts.length > 1 ? 4 : 3}
                    style={{
                      fontWeight: 600,
                      color: "var(--ink)",
                    }}
                  >
                    Totals
                  </TD>
                  <TD num>
                    {formatMoney(totalDebit, "USD", { compact: true })}
                  </TD>
                  <TD num>
                    {formatMoney(totalCredit, "USD", { compact: true })}
                  </TD>
                  <TD num neg={netRunning < 0}>
                    {formatMoney(netRunning, "USD", {
                      paren: true,
                      compact: true,
                    })}
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
