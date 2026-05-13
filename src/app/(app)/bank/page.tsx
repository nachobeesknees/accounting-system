import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  convertToBase,
  getBankAccounts,
  getBaseCurrency,
  getCustomers,
  getEntities,
  getLatestFxRates,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatAmount, parseAmount } from "@/lib/money";

export default async function Page() {
  const [bankAccounts, entities, customers, base, fxRates] = await Promise.all([
    getBankAccounts(),
    getEntities(),
    getCustomers(),
    getBaseCurrency(),
    getLatestFxRates(),
  ]);
  const entityById = new Map(entities.map((e) => [e.id, e] as const));
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const baseCode = base?.code ?? "USD";
  const baseSymbol = base?.symbol ?? "$";

  let totalBase = 0;
  for (const b of bankAccounts) {
    if (!b.currentBalance) continue;
    const native = parseAmount(b.currentBalance);
    if (b.currencyCode === baseCode) {
      totalBase += native;
    } else {
      const c = convertToBase(native, b.currencyCode, fxRates);
      if (c != null) totalBase += c;
    }
  }
  const formatBase = (n: number) =>
    `${baseSymbol}${formatAmount(n, { paren: true })}`;

  return (
    <>
      <PageHeader
        title="Bank Accounts"
        meta={`${bankAccounts.length} accounts · ${formatBase(totalBase)} total (${baseCode})`}
        actions={
          <ButtonLink variant="primary" href="/bank/new">
            + New bank account
          </ButtonLink>
        }
      />

      <div className="px-6 py-3.5 pb-8">
        <Card title="Accounts">
          {bankAccounts.length === 0 ? (
            <Empty
              title="No bank accounts"
              body="Add an account to start tracking balances and signers."
              cta={
                <ButtonLink variant="primary" href="/bank/new">
                  + New bank account
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Name</TH>
                  <TH>Institution</TH>
                  <TH>Last 4</TH>
                  <TH>Owner</TH>
                  <TH>As of</TH>
                  <TH num>Native balance</TH>
                  <TH num>In {baseCode}</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {bankAccounts.map((b) => {
                  const ent = b.entityId ? entityById.get(b.entityId) : undefined;
                  const cust = b.clientId
                    ? customerById.get(b.clientId)
                    : ent
                      ? customerById.get(ent.clientId)
                      : undefined;
                  return (
                    <TR key={b.id} href={`/bank/${b.id}`}>
                      <TD>
                        <Link
                          href={`/bank/${b.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {b.name}
                        </Link>
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {b.institution ?? "—"}
                      </TD>
                      <TD mono style={{ color: "var(--ink-3)" }}>
                        {b.lastFour ? `····${b.lastFour}` : "—"}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {ent ? `${ent.code} · ` : ""}
                        {cust?.name ?? "Internal"}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {b.balanceAsOf ? formatDate(b.balanceAsOf) : "—"}
                      </TD>
                      <TD num>
                        {b.currentBalance
                          ? `${b.currencyCode} ${formatAmount(parseAmount(b.currentBalance), { paren: true })}`
                          : "—"}
                      </TD>
                      <TD num>
                        {(() => {
                          if (!b.currentBalance) return "—";
                          const n = parseAmount(b.currentBalance);
                          if (b.currencyCode === baseCode) return formatBase(n);
                          const c = convertToBase(n, b.currencyCode, fxRates);
                          return c == null ? "—" : formatBase(c);
                        })()}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(b.isActive ? "active" : "inactive")}>
                          {statusLabel(b.isActive ? "active" : "inactive")}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD colSpan={5}>Total ({baseCode})</TD>
                  <TD num>{""}</TD>
                  <TD num>{formatBase(totalBase)}</TD>
                  <TD>{""}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
