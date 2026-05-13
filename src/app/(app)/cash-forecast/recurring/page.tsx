import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getRecurringPayments,
  getVendors,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD } from "@/lib/money";

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semi-annual",
  annual: "Annual",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; updated?: string; deleted?: string }>;
}) {
  const sp = await searchParams;

  const [payments, accountsAll, vendors] = await Promise.all([
    getRecurringPayments(),
    getAccounts("all"),
    getVendors(),
  ]);
  const expenseById = new Map(
    accountsAll
      .filter((a) => a.accountType === "expense")
      .map((a) => [a.id, a] as const),
  );
  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));

  const banner = sp.created
    ? "Recurring payment created."
    : sp.updated
      ? "Recurring payment updated."
      : sp.deleted
        ? "Recurring payment deleted."
        : null;

  return (
    <>
      <PageHeader
        title="Recurring payments"
        meta="Scheduled outflows (rent, payroll, taxes, etc.)"
        actions={
          <>
            <ButtonLink href="/cash-forecast" variant="secondary">
              ← Forecast
            </ButtonLink>
            <ButtonLink
              href="/cash-forecast/recurring/new"
              variant="primary"
            >
              + New payment
            </ButtonLink>
          </>
        }
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        {banner && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            {banner}
          </div>
        )}

        <Card title={`Recurring payments (${payments.length})`}>
          {payments.length === 0 ? (
            <Empty
              title="No recurring payments yet"
              body="Add scheduled outflows so they show up in the cash forecast."
              cta={
                <ButtonLink
                  href="/cash-forecast/recurring/new"
                  variant="primary"
                >
                  + New payment
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Name</TH>
                  <TH>Frequency</TH>
                  <TH num>Amount</TH>
                  <TH>Next payment</TH>
                  <TH>Expense account</TH>
                  <TH>Vendor</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((rp) => {
                  const acct = expenseById.get(rp.expenseAccountId);
                  const vend = rp.vendorId
                    ? vendorsById.get(rp.vendorId)
                    : undefined;
                  const statusKey = rp.isActive ? "active" : "inactive";
                  return (
                    <TR
                      key={rp.id}
                      href={`/cash-forecast/recurring/${rp.id}`}
                    >
                      <TD>{rp.name}</TD>
                      <TD>
                        <Pill variant="neutral">
                          {FREQUENCY_LABEL[rp.frequency] ?? rp.frequency}
                        </Pill>
                      </TD>
                      <TD num>{formatUSD(rp.amount, { paren: true })}</TD>
                      <TD mono>{formatDate(rp.nextPaymentDate)}</TD>
                      <TD mono>
                        {acct ? (
                          <>
                            {acct.code}
                            <span
                              className="ml-2"
                              style={{
                                color: "var(--ink-3)",
                                fontFamily: "var(--font-sans)",
                              }}
                            >
                              {acct.name}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>{vend?.name ?? "—"}</TD>
                      <TD>
                        <Pill variant={statusVariant(statusKey)}>
                          {rp.isActive ? "Active" : "Inactive"}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
