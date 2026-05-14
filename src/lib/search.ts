/**
 * Global ⌘K search. Server-only — runs ILIKE queries across major record
 * types in parallel and returns a flat result list grouped client-side.
 *
 * Limits each table to a small cap so the modal stays snappy.
 */

import "server-only";

import { or, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

export type SearchResultType =
  | "client"
  | "entity"
  | "contact"
  | "invoice"
  | "bill"
  | "journal_entry"
  | "account"
  | "asset"
  | "bank_account";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  /** Secondary line beneath title (e.g. amount + status). */
  subtitle?: string;
  /** Where to navigate when this row is selected. */
  href: string;
};

const PER_TYPE_LIMIT = 8;

export async function searchGlobal(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const db = getDb();
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const [
    customers,
    entities,
    contacts,
    invoices,
    bills,
    journalEntries,
    accounts,
    assets,
    bankAccounts,
  ] = await Promise.all([
    db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        code: schema.customers.code,
        email: schema.customers.email,
      })
      .from(schema.customers)
      .where(
        or(
          sql`${schema.customers.name} ILIKE ${pattern}`,
          sql`${schema.customers.code} ILIKE ${pattern}`,
          sql`${schema.customers.email} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.entities.id,
        name: schema.entities.name,
        code: schema.entities.code,
        kind: schema.entities.kind,
        jurisdiction: schema.entities.jurisdiction,
      })
      .from(schema.entities)
      .where(
        or(
          sql`${schema.entities.name} ILIKE ${pattern}`,
          sql`${schema.entities.code} ILIKE ${pattern}`,
          sql`${schema.entities.ein} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.contacts.id,
        name: schema.contacts.name,
        code: schema.contacts.code,
        email: schema.contacts.email,
      })
      .from(schema.contacts)
      .where(
        or(
          sql`${schema.contacts.name} ILIKE ${pattern}`,
          sql`${schema.contacts.code} ILIKE ${pattern}`,
          sql`${schema.contacts.email} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.invoices.id,
        invoiceNumber: schema.invoices.invoiceNumber,
        customerId: schema.invoices.customerId,
        total: schema.invoices.total,
        status: schema.invoices.status,
        currencyCode: schema.invoices.currencyCode,
        notes: schema.invoices.notes,
      })
      .from(schema.invoices)
      .where(
        or(
          sql`${schema.invoices.invoiceNumber} ILIKE ${pattern}`,
          sql`${schema.invoices.notes} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.bills.id,
        billNumber: schema.bills.billNumber,
        vendorId: schema.bills.vendorId,
        total: schema.bills.total,
        status: schema.bills.status,
        currencyCode: schema.bills.currencyCode,
        notes: schema.bills.notes,
      })
      .from(schema.bills)
      .where(
        or(
          sql`${schema.bills.billNumber} ILIKE ${pattern}`,
          sql`${schema.bills.notes} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.journalEntries.id,
        entryNumber: schema.journalEntries.entryNumber,
        description: schema.journalEntries.description,
        entryDate: schema.journalEntries.entryDate,
        status: schema.journalEntries.status,
        reference: schema.journalEntries.reference,
      })
      .from(schema.journalEntries)
      .where(
        or(
          sql`${schema.journalEntries.entryNumber} ILIKE ${pattern}`,
          sql`${schema.journalEntries.description} ILIKE ${pattern}`,
          sql`${schema.journalEntries.reference} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.accounts.id,
        code: schema.accounts.code,
        name: schema.accounts.name,
        accountType: schema.accounts.accountType,
      })
      .from(schema.accounts)
      .where(
        or(
          sql`${schema.accounts.code} ILIKE ${pattern}`,
          sql`${schema.accounts.name} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.assets.id,
        name: schema.assets.name,
        kind: schema.assets.kind,
        externalRef: schema.assets.externalRef,
        currencyCode: schema.assets.currencyCode,
      })
      .from(schema.assets)
      .where(
        or(
          sql`${schema.assets.name} ILIKE ${pattern}`,
          sql`${schema.assets.externalRef} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),

    db
      .select({
        id: schema.bankAccounts.id,
        name: schema.bankAccounts.name,
        institution: schema.bankAccounts.institution,
        lastFour: schema.bankAccounts.lastFour,
        currencyCode: schema.bankAccounts.currencyCode,
      })
      .from(schema.bankAccounts)
      .where(
        or(
          sql`${schema.bankAccounts.name} ILIKE ${pattern}`,
          sql`${schema.bankAccounts.institution} ILIKE ${pattern}`,
          sql`${schema.bankAccounts.lastFour} ILIKE ${pattern}`,
        ),
      )
      .limit(PER_TYPE_LIMIT),
  ]);

  const out: SearchResult[] = [];

  for (const r of customers) {
    out.push({
      type: "client",
      id: r.id,
      title: r.name,
      subtitle: [r.code, r.email].filter(Boolean).join(" · ") || undefined,
      href: `/customers/${r.id}`,
    });
  }
  for (const r of entities) {
    out.push({
      type: "entity",
      id: r.id,
      title: r.name,
      subtitle:
        [r.code, r.kind, r.jurisdiction].filter(Boolean).join(" · ") ||
        undefined,
      href: `/entities/${r.id}`,
    });
  }
  for (const r of contacts) {
    out.push({
      type: "contact",
      id: r.id,
      title: r.name,
      subtitle: [r.code, r.email].filter(Boolean).join(" · ") || undefined,
      href: `/contacts/${r.id}`,
    });
  }
  for (const r of invoices) {
    out.push({
      type: "invoice",
      id: r.id,
      title: r.invoiceNumber,
      subtitle: [
        `${r.currencyCode} ${r.total}`,
        r.status,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/invoices/${r.id}`,
    });
  }
  for (const r of bills) {
    out.push({
      type: "bill",
      id: r.id,
      title: r.billNumber,
      subtitle: [
        `${r.currencyCode} ${r.total}`,
        r.status,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/bills/${r.id}`,
    });
  }
  for (const r of journalEntries) {
    out.push({
      type: "journal_entry",
      id: r.id,
      title: r.entryNumber,
      subtitle:
        [r.entryDate, r.status, r.description ?? ""]
          .filter(Boolean)
          .join(" · ") || undefined,
      href: `/journal/${r.entryNumber}`,
    });
  }
  for (const r of accounts) {
    out.push({
      type: "account",
      id: r.id,
      title: `${r.code} — ${r.name}`,
      subtitle: r.accountType,
      href: `/ledger?account=${encodeURIComponent(r.code)}`,
    });
  }
  for (const r of assets) {
    out.push({
      type: "asset",
      id: r.id,
      title: r.name,
      subtitle:
        [r.kind, r.externalRef ?? ""].filter(Boolean).join(" · ") || undefined,
      href: `/aua/${r.id}`,
    });
  }
  for (const r of bankAccounts) {
    out.push({
      type: "bank_account",
      id: r.id,
      title: r.name,
      subtitle:
        [r.institution ?? "", r.lastFour ? `••${r.lastFour}` : ""]
          .filter(Boolean)
          .join(" · ") || undefined,
      href: `/bank/${r.id}`,
    });
  }

  return out;
}
