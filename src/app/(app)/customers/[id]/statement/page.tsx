import { notFound } from "next/navigation";
import Link from "next/link";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import {
  getBaseCurrency,
  getCustomerById,
  getFundsOnAccount,
  getInvoices,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { buildStatement } from "@/lib/statement";

const BUCKET_LABEL: Record<string, string> = {
  current: "Current",
  d30: "1–30",
  d60: "31–60",
  d90: "61–90",
  d90p: "90+",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const asOf = sp.asOf || new Date().toISOString().slice(0, 10);

  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const [invoices, funds, base] = await Promise.all([
    getInvoices(),
    getFundsOnAccount(id),
    getBaseCurrency(),
  ]);
  const baseCode = base?.code ?? "USD";
  const stmt = buildStatement(invoices, id, asOf, funds);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/customers" },
          { label: customer.name, href: `/customers/${customer.id}` },
          { label: "Statement" },
        ]}
      />
      <PageHeader
        title={`Statement — ${customer.name}`}
        meta={`As of ${asOf}`}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/customers/${customer.id}`}>
              ← Client
            </ButtonLink>
            <CsvDownloadButton report="statement" extraParams={{ id, asOf }} />
            <PrintButton />
          </>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        <Card title="Summary">
          <KVGrid>
            <KV k="Client" v={customer.name} sub={customer.code} />
            <KV k="As of" v={formatDate(asOf)} />
            <KV
              k="Opening balance"
              v={formatMoney(stmt.openingBalance, baseCode, { compact: true, paren: true })}
              mono
            />
            <KV
              k="Funds on account"
              v={formatMoney(stmt.fundsOnAccount, baseCode, { compact: true })}
              mono
            />
            <KV
              k="Closing balance"
              v={formatMoney(stmt.closingBalance, baseCode, { compact: true, paren: true })}
              mono
            />
          </KVGrid>
        </Card>

        <Card title="Aged open items">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Invoice</TH>
                <TH>Type</TH>
                <TH>Date</TH>
                <TH>Due</TH>
                <TH num>Age</TH>
                <TH>Bucket</TH>
                <TH num>Balance</TH>
              </TR>
            </THead>
            <TBody>
              {stmt.lines.length === 0 && (
                <TR hover={false}>
                  <TD colSpan={7} style={{ color: "var(--ink-3)" }}>
                    No open items as of {asOf}.
                  </TD>
                </TR>
              )}
              {stmt.lines.map((l) => (
                <TR key={l.invoiceId}>
                  <TD mono>
                    <Link
                      href={`/invoices/${l.invoiceId}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {l.invoiceNumber}
                    </Link>
                  </TD>
                  <TD>
                    {l.kind === "credit_memo" ? (
                      <Pill variant="neutral">Credit memo</Pill>
                    ) : (
                      <Pill variant="active">Invoice</Pill>
                    )}
                  </TD>
                  <TD>{formatDate(l.invoiceDate)}</TD>
                  <TD>{formatDate(l.dueDate)}</TD>
                  <TD num neg={l.ageDays > 0}>{l.ageDays <= 0 ? "—" : `${l.ageDays}d`}</TD>
                  <TD>{BUCKET_LABEL[l.bucket]}</TD>
                  <TD num neg={l.balance < 0}>
                    {formatMoney(l.balance, l.currencyCode, { compact: true, paren: true })}
                  </TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD colSpan={6}>Total open (before funds)</TD>
                <TD num>
                  {formatMoney(
                    stmt.closingBalance + stmt.fundsOnAccount,
                    baseCode,
                    { compact: true, paren: true },
                  )}
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Card title="Aging summary">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Current</TH>
                <TH>1–30</TH>
                <TH>31–60</TH>
                <TH>61–90</TH>
                <TH>90+</TH>
              </TR>
            </THead>
            <TBody>
              <TR hover={false}>
                <TD num>{formatMoney(stmt.buckets.current, baseCode, { compact: true, paren: true })}</TD>
                <TD num>{formatMoney(stmt.buckets.d30, baseCode, { compact: true, paren: true })}</TD>
                <TD num>{formatMoney(stmt.buckets.d60, baseCode, { compact: true, paren: true })}</TD>
                <TD num>{formatMoney(stmt.buckets.d90, baseCode, { compact: true, paren: true })}</TD>
                <TD num neg={stmt.buckets.d90p > 0}>
                  {formatMoney(stmt.buckets.d90p, baseCode, { compact: true, paren: true })}
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
