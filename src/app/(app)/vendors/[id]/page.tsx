import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getAccountById, getBills, getVendorById } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const allBills = await getBills();
  const vendorBills = allBills
    .filter((b) => b.vendorId === vendor.id)
    .slice()
    .sort((a, b) => b.billDate.localeCompare(a.billDate));

  const totalBilled = vendorBills.reduce(
    (s, b) => s + parseAmount(b.total),
    0,
  );
  const totalPaid = vendorBills.reduce(
    (s, b) => s + parseAmount(b.amountPaid),
    0,
  );
  const outstanding = vendorBills.reduce(
    (s, b) => s + parseAmount(b.balanceDue),
    0,
  );
  const lastBillDate = vendorBills[0]?.billDate ?? null;

  const addressLines = (vendor.address ?? "").split(/,\s*/);
  const defaultAcct = vendor.defaultExpenseAccountId
    ? await getAccountById(vendor.defaultExpenseAccountId)
    : undefined;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Vendors", href: "/vendors" },
          { label: `${vendor.code} — ${vendor.name}` },
        ]}
      />
      <PageHeader
        title={vendor.name}
        meta={vendor.code}
        actions={
          <ButtonLink variant="secondary" href="/vendors">
            ← All vendors
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 px-6 my-3.5">
        <Card title="Contact">
          <KVGrid>
            <KV k="Code" v={vendor.code} mono />
            <KV k="Email" v={vendor.email ?? "—"} />
            <KV k="Phone" v={vendor.phone ?? "—"} mono />
            <KV
              k="Address"
              v={
                vendor.address ? (
                  <div className="flex flex-col">
                    {addressLines.map((line, idx) => (
                      <span key={idx}>{line}</span>
                    ))}
                  </div>
                ) : (
                  "—"
                )
              }
            />
            <KV k="Payment terms" v={`Net ${vendor.paymentTerms}`} />
            <KV
              k="Default expense"
              v={defaultAcct ? `${defaultAcct.code} — ${defaultAcct.name}` : "—"}
              mono
            />
          </KVGrid>
        </Card>

        <Card title="Balance summary">
          <KVGrid>
            <KV
              k="Total billed"
              v={formatUSD(totalBilled, { paren: true })}
              mono
            />
            <KV
              k="Total paid"
              v={formatUSD(totalPaid, { paren: true })}
              mono
            />
            <KV
              k="Outstanding balance"
              v={formatUSD(outstanding, { paren: true })}
              mono
            />
            <KV
              k="Last bill date"
              v={lastBillDate ? formatDate(lastBillDate) : "—"}
            />
          </KVGrid>
        </Card>
      </div>

      <div className="px-6 mb-8">
        <Card title="Bills">
          {vendorBills.length === 0 ? (
            <Empty
              title="No bills yet"
              body="This vendor has no bills on record."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Bill #</TH>
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH num>Total</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {vendorBills.map((bill) => {
                  const bal = parseAmount(bill.balanceDue);
                  const isOverdue = bill.status === "overdue" && bal > 0;
                  return (
                    <TR key={bill.id}>
                      <TD mono>
                        <Link
                          href={`/bills/${bill.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {bill.billNumber}
                        </Link>
                      </TD>
                      <TD>{formatDate(bill.billDate)}</TD>
                      <TD>{formatDate(bill.dueDate)}</TD>
                      <TD num>{formatUSD(bill.total, { paren: true })}</TD>
                      <TD num neg={isOverdue}>
                        {formatUSD(bal, { paren: true })}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(bill.status)}>
                          {statusLabel(bill.status)}
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
