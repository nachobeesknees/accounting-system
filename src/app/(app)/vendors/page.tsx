import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { IconUsers } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getAccounts, getBills, getVendors } from "@/lib/data";
import { formatMoney, parseAmount } from "@/lib/money";
import type { Vendor } from "@/lib/types";

function filterVendors(vendors: Vendor[], q: string): Vendor[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return vendors;
  return vendors.filter((v) => {
    const hay = `${v.code} ${v.name} ${v.email ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";

  const [allVendors, allBills, accounts] = await Promise.all([
    getVendors(),
    getBills(),
    getAccounts(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const rows = filterVendors(allVendors, q).slice().sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const balanceFor = (vendorId: string): number =>
    allBills
      .filter((b) => b.vendorId === vendorId)
      .reduce((s, b) => s + parseAmount(b.balanceDue), 0);

  const balances = new Map(rows.map((v) => [v.id, balanceFor(v.id)] as const));
  const balanceTotal = Array.from(balances.values()).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title="Vendors"
        meta={`${rows.length} active`}
        actions={
          <ButtonLink variant="primary" href="/vendors/new">
            + New vendor
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
            placeholder="Code, name, or email"
            defaultValue={q}
          />
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/vendors">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Vendors">
          {rows.length === 0 ? (
            <Empty
              icon={<IconUsers size={20} />}
              title={
                allVendors.length === 0
                  ? "No vendors yet"
                  : "No vendors match your search"
              }
              body={
                allVendors.length === 0
                  ? "Add the firms and individuals you pay — bills route to them and feed AP aging."
                  : "Try a different query or add a new vendor."
              }
              cta={
                <ButtonLink variant="primary" href="/vendors/new">
                  + New vendor
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Default expense acct</TH>
                  <TH num>Terms</TH>
                  <TH num>Balance (USD)</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((v) => {
                  const balance = balances.get(v.id) ?? 0;
                  const statusKey = v.isActive ? "active" : "inactive";
                  const acct = v.defaultExpenseAccountId
                    ? accountById.get(v.defaultExpenseAccountId)
                    : undefined;
                  return (
                    <TR key={v.id} href={`/vendors/${v.id}`}>
                      <TD mono>
                        <Link
                          href={`/vendors/${v.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {v.code}
                        </Link>
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span>{v.name}</span>
                          {v.approvalStatus === "pending" && (
                            <Pill variant="pending">Pending approval</Pill>
                          )}
                          {v.approvalStatus === "rejected" && (
                            <Pill variant="review">Rejected</Pill>
                          )}
                        </span>
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {v.email ?? "—"}
                      </TD>
                      <TD mono>{acct?.code ?? "—"}</TD>
                      <TD num>{`Net ${v.paymentTerms}`}</TD>
                      <TD num>{formatMoney(balance, "USD", { paren: true, compact: true, hideCurrency: true })}</TD>
                      <TD>
                        <Pill variant={statusVariant(statusKey)}>
                          {statusLabel(statusKey)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD>Total</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD num>{formatMoney(balanceTotal, "USD", { paren: true, compact: true, hideCurrency: true })}</TD>
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
