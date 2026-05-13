import { PageHeader } from "@/components/ui/PageHeader";
import { getContacts } from "@/lib/data";
import { NewContactForm } from "./NewContactForm";

function nextContactCode(existing: string[]): string {
  const max = existing
    .map((c) => {
      const m = c.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `CT-NEW-${String(max + 1).padStart(3, "0")}`;
}

export default async function Page() {
  const contacts = await getContacts();
  return (
    <>
      <PageHeader title="New contact" meta="Contacts / New" />
      <NewContactForm nextCode={nextContactCode(contacts.map((c) => c.code))} />
    </>
  );
}
