import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row } from "@/components/ui/Field";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getAccountById, getBills, getVendorById } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { updateVendorInvoiceNumberRule } from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";
import { suggestNextVendorInvoiceNumber } from "@/lib/vendor-invoice-numbers";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  async function saveInvoiceRule(formData: FormData) {
    "use server";
    const user = await getSessionUser();
    if (!user) redirect("/login");
    const vendorId = String(formData.get("vendorId") ?? "");
    if (!vendorId) redirect("/vendors");
    const prefix = String(formData.get("invoiceNumberPrefix") ?? "").trim();
    const pattern = String(formData.get("invoiceNumberPattern") ?? "").trim();
    const lastUsed = String(formData.get("invoiceNumberLastUsed") ?? "").trim();
    try {
      await updateVendorInvoiceNumberRule(user, vendorId, {
        invoiceNumberPrefix: prefix === "" ? null : prefix,
        invoiceNumberPattern: pattern === "" ? null : pattern,
        invoiceNumberLastUsed: lastUsed === "" ? null : lastUsed,
      });
      revalidatePath(`/vendors/${vendorId}`);
      redirect(`/vendors/${vendorId}?saved=1`);
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "digest" in err &&
        typeof (err as { digest: unknown }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : "Failed to save rule.";
      redirect(`/vendors/${vendorId}?error=${encodeURIComponent(msg)}`);
    }
  }

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

      {sp.saved === "1" && (
        <div
          className="px-6"
          style={{ marginTop: 12 }}
        >
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Invoice numbering rule saved.
          </div>
        </div>
      )}
      {sp.error && (
        <div className="px-6" style={{ marginTop: 12 }}>
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {sp.error}
          </div>
        </div>
      )}

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
              v={formatMoney(totalBilled, "USD", { paren: true , compact: true })}
              mono
            />
            <KV
              k="Total paid"
              v={formatMoney(totalPaid, "USD", { paren: true , compact: true })}
              mono
            />
            <KV
              k="Outstanding balance"
              v={formatMoney(outstanding, "USD", { paren: true , compact: true })}
              mono
            />
            <KV
              k="Last bill date"
              v={lastBillDate ? formatDate(lastBillDate) : "—"}
            />
          </KVGrid>
        </Card>
      </div>

      <div className="px-6 mb-3.5">
        <Card title="Invoice numbering rule">
          <form action={saveInvoiceRule} className="p-3.5 flex flex-col gap-3">
            <input type="hidden" name="vendorId" value={vendor.id} />
            <Row>
              <Field
                label="Prefix"
                name="invoiceNumberPrefix"
                placeholder="INV-"
                defaultValue={vendor.invoiceNumberPrefix ?? ""}
                mono
                help="Informational — drives the placeholder shown on bill entry."
              />
              <Field
                label="Pattern"
                name="invoiceNumberPattern"
                placeholder="INV-YYYY-####"
                defaultValue={vendor.invoiceNumberPattern ?? ""}
                mono
                help="Placeholders: YYYY, YY, MM, DD, ####."
              />
            </Row>
            <Row>
              <Field
                label="Last used"
                name="invoiceNumberLastUsed"
                placeholder="INV-2025-0042"
                defaultValue={vendor.invoiceNumberLastUsed ?? ""}
                mono
                help="The next suggestion increments the trailing digits."
              />
              <div className="flex flex-col gap-1">
                <span
                  className="text-[11.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  Next suggested
                </span>
                <div
                  className="px-2.5 py-1.5 text-[13px] rounded-md"
                  style={{
                    background: "var(--rail)",
                    border: "1px solid var(--line-2)",
                    color: "var(--ink-2)",
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    minHeight: 32,
                  }}
                >
                  {suggestNextVendorInvoiceNumber(vendor) ?? "—"}
                </div>
              </div>
            </Row>
            <div className="flex justify-end">
              <Button variant="primary" type="submit">
                Save rule
              </Button>
            </div>
          </form>
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
                      <TD num>{formatMoney(bill.total, "USD", { paren: true , compact: true })}</TD>
                      <TD num neg={isOverdue}>
                        {formatMoney(bal, "USD", { paren: true , compact: true })}
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
