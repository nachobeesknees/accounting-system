import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  DEMO_TODAY,
  accountsByType,
  getAccountBalance,
  getKpis,
  getTrialBalance,
} from "@/lib/data";
import { formatUSD } from "@/lib/money";
import type { Account } from "@/lib/types";

type TabId = "balance" | "income" | "trial";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function SectionHeading({ label }: { label: string }) {
  return (
    <TR hover={false}>
      <TH style={{ width: "120px" }}>{label}</TH>
      <TH></TH>
      <TH num>Amount</TH>
    </TR>
  );
}

function AccountRow({ account, value }: { account: Account; value: number }) {
  return (
    <TR>
      <TD mono>{account.code}</TD>
      <TD>{account.name}</TD>
      <TD num neg={value < 0}>
        {formatUSD(value, { paren: true })}
      </TD>
    </TR>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <TR total hover={false}>
      <TD
        colSpan={2}
        style={{ fontWeight: 600, color: "var(--ink)" }}
      >
        {label}
      </TD>
      <TD num neg={value < 0}>
        {formatUSD(value, { paren: true })}
      </TD>
    </TR>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const rawTab = (params.tab ?? "balance").toLowerCase();
  const tab: TabId =
    rawTab === "income" || rawTab === "trial" ? (rawTab as TabId) : "balance";

  const formattedDate = formatDate(DEMO_TODAY);
  const kpis = getKpis();
  const byType = accountsByType();

  const assetAccounts = byType.get("asset") ?? [];
  const liabilityAccounts = byType.get("liability") ?? [];
  const equityAccounts = byType.get("equity") ?? [];
  const revenueAccounts = byType.get("revenue") ?? [];
  const expenseAccounts = byType.get("expense") ?? [];

  const trial = getTrialBalance();
  const trialDebits = trial.reduce((s, r) => s + r.debit, 0);
  const trialCredits = trial.reduce((s, r) => s + r.credit, 0);
  const trialBalanced = Math.abs(trialDebits - trialCredits) < 0.005;

  return (
    <>
      <PageHeader
        title="Financial Statements"
        meta={`As of ${formattedDate}`}
        actions={
          <Button variant="secondary" disabled>
            Export CSV
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: "balance", label: "Balance Sheet", href: "/reports?tab=balance" },
          { id: "income", label: "Income Statement", href: "/reports?tab=income" },
          { id: "trial", label: "Trial Balance", href: "/reports?tab=trial" },
        ]}
        activeId={tab}
      />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        {tab === "balance" && (
          <Card title="Balance Sheet">
            <Table>
              <THead>
                <SectionHeading label="Assets" />
              </THead>
              <TBody>
                {assetAccounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    value={getAccountBalance(a.id)}
                  />
                ))}
                <TotalRow label="Total Assets" value={kpis.assets} />
              </TBody>
              <THead>
                <SectionHeading label="Liabilities" />
              </THead>
              <TBody>
                {liabilityAccounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    value={getAccountBalance(a.id)}
                  />
                ))}
                <TotalRow label="Total Liabilities" value={kpis.liabilities} />
              </TBody>
              <THead>
                <SectionHeading label="Equity" />
              </THead>
              <TBody>
                {equityAccounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    value={getAccountBalance(a.id)}
                  />
                ))}
                <TotalRow label="Total Equity" value={kpis.equity} />
              </TBody>
            </Table>
          </Card>
        )}

        {tab === "income" && (
          <Card title="Income Statement">
            <Table>
              <THead>
                <SectionHeading label="Revenue" />
              </THead>
              <TBody>
                {revenueAccounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    value={getAccountBalance(a.id)}
                  />
                ))}
                <TotalRow label="Total Revenue" value={kpis.revenue} />
              </TBody>
              <THead>
                <SectionHeading label="Expenses" />
              </THead>
              <TBody>
                {expenseAccounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    value={getAccountBalance(a.id)}
                  />
                ))}
                <TotalRow label="Total Expenses" value={kpis.expenses} />
                <TR
                  hover={false}
                  total
                >
                  <TD
                    colSpan={2}
                    style={{
                      fontWeight: 700,
                      color: "var(--p-formation-fg)",
                      background: "var(--p-formation-bg)",
                    }}
                  >
                    Net Income
                  </TD>
                  <TD
                    num
                    style={{
                      fontWeight: 700,
                      color: "var(--p-formation-fg)",
                      background: "var(--p-formation-bg)",
                    }}
                  >
                    {formatUSD(kpis.netIncome, { paren: true })}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </Card>
        )}

        {tab === "trial" && (
          <Card
            title="Trial Balance"
            actions={
              trialBalanced ? (
                <Pill variant="active">Balanced</Pill>
              ) : (
                <Pill variant="review">Unbalanced</Pill>
              )
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Account</TH>
                  <TH num>Debit</TH>
                  <TH num>Credit</TH>
                </TR>
              </THead>
              <TBody>
                {trial.map((row) => (
                  <TR key={row.accountId}>
                    <TD mono>{row.code}</TD>
                    <TD>{row.name}</TD>
                    <TD num>
                      {row.debit === 0 ? "—" : formatUSD(row.debit)}
                    </TD>
                    <TD num>
                      {row.credit === 0 ? "—" : formatUSD(row.credit)}
                    </TD>
                  </TR>
                ))}
                <TR total hover={false}>
                  <TD
                    colSpan={2}
                    style={{ fontWeight: 600, color: "var(--ink)" }}
                  >
                    Totals
                  </TD>
                  <TD num>{formatUSD(trialDebits)}</TD>
                  <TD num>{formatUSD(trialCredits)}</TD>
                </TR>
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
