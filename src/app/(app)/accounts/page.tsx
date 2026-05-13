import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  accountTypeOrder,
  accountsByType,
  getAccounts,
  getDisplayBalances,
} from "@/lib/data";
import { formatUSD } from "@/lib/money";
import type { AccountType } from "@/lib/types";

const TYPE_LABEL: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

const ALL_FILTERS: Array<{ id: string; label: string; type?: AccountType }> = [
  { id: "all", label: "All" },
  { id: "asset", label: "Assets", type: "asset" },
  { id: "liability", label: "Liabilities", type: "liability" },
  { id: "equity", label: "Equity", type: "equity" },
  { id: "revenue", label: "Revenue", type: "revenue" },
  { id: "expense", label: "Expense", type: "expense" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const typeParam = params.type?.toLowerCase();
  const activeFilter =
    ALL_FILTERS.find((f) => f.id === typeParam)?.id ?? "all";

  const [accounts, byType, balances] = await Promise.all([
    getAccounts(),
    accountsByType(),
    getDisplayBalances(),
  ]);

  const orderedTypes = accountTypeOrder().filter((t) =>
    activeFilter === "all" ? true : t === activeFilter,
  );

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        meta={`${accounts.length} accounts in the GL`}
      />

      <div
        className="px-6 pb-3 flex gap-2 items-center"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span
          className="text-[11.5px] uppercase"
          style={{ color: "var(--ink-3)", letterSpacing: "0.04em" }}
        >
          Filter:
        </span>
        {ALL_FILTERS.map((f) => {
          const active = f.id === activeFilter;
          const href =
            f.id === "all" ? "/accounts" : `/accounts?type=${f.id}`;
          return (
            <ButtonLink
              key={f.id}
              variant={active ? "primary" : "secondary"}
              href={href}
            >
              {f.label}
            </ButtonLink>
          );
        })}
      </div>

      <div className="flex flex-col gap-3.5 px-6 py-3.5 pb-8">
        {orderedTypes.every((t) => (byType.get(t) ?? []).length === 0) && (
          <Card title="Accounts">
            <Empty
              title="No accounts match this filter"
              body={
                activeFilter === "all"
                  ? "Seed your chart of accounts to get started."
                  : "Try a different account type or clear the filter."
              }
              cta={
                activeFilter === "all" ? undefined : (
                  <ButtonLink variant="secondary" href="/accounts">
                    Clear filter
                  </ButtonLink>
                )
              }
            />
          </Card>
        )}
        {orderedTypes.map((t) => {
          const list = byType.get(t) ?? [];
          if (list.length === 0) return null;
          return (
            <Card
              key={t}
              title={
                <span>
                  {TYPE_LABEL[t]}{" "}
                  <span
                    className="font-normal"
                    style={{ color: "var(--ink-4)" }}
                  >
                    ({list.length} accounts)
                  </span>
                </span>
              }
            >
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH>Code</TH>
                    <TH>Name</TH>
                    <TH>Sub-type</TH>
                    <TH>Normal</TH>
                    <TH num>Balance</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.map((a) => {
                    const bal = balances.get(a.id) ?? 0;
                    return (
                      <TR key={a.id}>
                        <TD mono>{a.code}</TD>
                        <TD>{a.name}</TD>
                        <TD
                          style={{
                            color: "var(--ink-3)",
                            fontSize: 11.5,
                          }}
                        >
                          {a.subType ?? "—"}
                        </TD>
                        <TD
                          style={{
                            color: "var(--ink-3)",
                            fontSize: 11.5,
                          }}
                        >
                          {a.normalBalance}
                        </TD>
                        <TD num neg={bal < 0}>
                          {formatUSD(bal, { paren: true })}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
