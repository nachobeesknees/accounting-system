import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
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
      <Breadcrumbs items={[{ label: "Contacts", href: "/contacts" }, { label: "New" }]} />
      <PageHeader title="New contact" />
      <NewContactForm nextCode={nextContactCode(contacts.map((c) => c.code))} />
    </>
  );
}
