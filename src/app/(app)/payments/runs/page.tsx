import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, type PillVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getBankAccounts, getPaymentRuns, getUsers } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import type { PaymentRunStatus } from "@/lib/types";

function runStatusVariant(status: PaymentRunStatus): PillVariant {
  switch (status) {
    case "released":
      return "active";
    case "pending_release":
      return "pending";
    case "void":
      return "review";
    default:
      return "neutral";
  }
}

/**
 * Dual-control payment runs. Preparation happens at /bills/pay-run; a
 * different user with payment.release executes the run from its detail
 * page. This list is the queue + history.
 */
export default async function Page() {
  const [runs, bankAccounts, users] = await Promise.all([
    getPaymentRuns(),
    getBankAccounts(),
    getUsers(),
  ]);
  const banksById = new Map(bankAccounts.map((b) => [b.id, b] as const));
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const pending = runs.filter((r) => r.status === "pending_release");

  function userName(id: string | null): string {
    if (!id) return "—";
    return usersById.get(id)?.fullName ?? id;
  }

  return (
    <>
      <PageHeader
        title="Payment Runs"
        meta={`${pending.length} awaiting release · ${runs.length} total`}
        actions={
          <ButtonLink href="/bills/pay-run" variant="primary">
            Prepare a payment run
          </ButtonLink>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        <Card title="All runs">
          {runs.length === 0 ? (
            <Empty
              title="No payment runs yet"
              body="Prepare one from Select bills to pay — a second user then releases it (dual control)."
              cta={
                <ButtonLink href="/bills/pay-run" variant="primary">
                  Select bills to pay
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Run #</TH>
                  <TH>Status</TH>
                  <TH>Funding account</TH>
                  <TH num>Bills</TH>
                  <TH num>Total</TH>
                  <TH>Prepared by</TH>
                  <TH>Prepared</TH>
                  <TH>Released by</TH>
                  <TH>Released</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((r) => {
                  const bank = banksById.get(r.bankAccountId);
                  return (
                    <TR key={r.id} href={`/payments/runs/${r.id}`}>
                      <TD mono>{r.runNumber}</TD>
                      <TD>
                        <Pill variant={runStatusVariant(r.status)}>
                          {statusLabel(r.status)}
                        </Pill>
                      </TD>
                      <TD>{bank?.name ?? r.bankAccountId}</TD>
                      <TD num>{r.itemCount}</TD>
                      <TD num>
                        {formatMoney(parseAmount(r.total), bank?.currencyCode ?? "USD", {
                          paren: true,
                        })}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>{userName(r.preparedBy)}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {r.preparedAt ? formatDate(r.preparedAt.slice(0, 10)) : "—"}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>{userName(r.releasedBy)}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {r.releasedAt ? formatDate(r.releasedAt.slice(0, 10)) : "—"}
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
