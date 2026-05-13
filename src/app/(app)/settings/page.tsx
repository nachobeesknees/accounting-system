import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Card";
import { KV, KVGrid } from "@/components/ui/KV";
import { getAccountByCode } from "@/lib/data";
import { store } from "@/lib/store";

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}

function formatAccountRef(code: string): string {
  const account = getAccountByCode(code);
  if (!account) return code;
  return `${account.code} — ${account.name}`;
}

export default async function Page() {
  const nextInvoice = `INV-${pad(store.nextInvoiceNumber, 6)}`;
  const nextJournal = `JE-${pad(store.nextJeNumber, 6)}`;
  const billYear = new Date().getFullYear();
  const nextBill = `BILL-${billYear}-${pad(store.nextBillNumber, 3)}`;

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
            <KV k="AR" v={formatAccountRef("1200")} mono />
            <KV k="AP" v={formatAccountRef("2000")} mono />
            <KV
              k="Retained Earnings"
              v={formatAccountRef("3100")}
              mono
            />
            <KV k="Cash" v={formatAccountRef("1000")} mono />
          </KVGrid>
        </Section>
      </div>
    </>
  );
}
