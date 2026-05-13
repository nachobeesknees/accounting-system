import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Card";
import { KV, KVGrid } from "@/components/ui/KV";
import { getAccountByCode } from "@/lib/data";
import {
  nextBillNumber,
  nextEntryNumber,
  nextInvoiceNumber,
} from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";

async function formatAccountRef(code: string): Promise<string> {
  const account = await getAccountByCode(code);
  if (!account) return code;
  return `${account.code} — ${account.name}`;
}

export default async function Page() {
  const [user, nextInvoice, nextJournal, nextBill, arLabel, apLabel, reLabel, cashLabel] =
    await Promise.all([
      getSessionUser(),
      nextInvoiceNumber(),
      nextEntryNumber(),
      nextBillNumber(),
      formatAccountRef("1200"),
      formatAccountRef("2000"),
      formatAccountRef("3100"),
      formatAccountRef("1000"),
    ]);

  return (
    <>
      <PageHeader title="Settings" meta="Company configuration" />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        <Section title="Company">
          <KVGrid>
            <KV k="Legal name" v="Thistlewood & Associates, LLC" />
            <KV k="Functional currency" v="USD" mono />
            <KV k="Fiscal year start" v="January" />
            <KV k="Country" v="United States" />
          </KVGrid>
        </Section>

        <Section title="Number sequences">
          <KVGrid>
            <KV k="Next invoice" v={nextInvoice} mono />
            <KV k="Next journal entry" v={nextJournal} mono />
            <KV k="Next bill" v={nextBill} mono />
          </KVGrid>
        </Section>

        <Section title="Default accounts">
          <KVGrid>
            <KV k="AR" v={arLabel} mono />
            <KV k="AP" v={apLabel} mono />
            <KV k="Retained Earnings" v={reLabel} mono />
            <KV k="Cash" v={cashLabel} mono />
          </KVGrid>
        </Section>

        <Section title="Bulk operations">
          <div className="flex flex-col gap-1 text-[13px]">
            <Link
              href="/settings/import-export"
              style={{ color: "var(--ink)", textDecoration: "underline" }}
            >
              CSV import / export →
            </Link>
            <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
              {user?.isSuperuser
                ? "Download templates, export current data, bulk-import new records."
                : "Admin only — your current session does not have superuser access."}
            </span>
          </div>
        </Section>
      </div>
    </>
  );
}
