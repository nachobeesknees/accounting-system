import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import {
  ensureAccountingPeriods,
} from "@/lib/periods";
import { ImportForm } from "./ImportForm";

export default async function Page() {
  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const user = await getSessionUser();
  const canImport = hasPermission(user, "journal_entry.create");

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Journal entries", href: "/journal" },
          { label: "Import" },
        ]}
      />
      <PageHeader
        title="Import journal entries"
        meta="CSV rows grouped by Reference become balanced draft entries."
        actions={
          <ButtonLink variant="secondary" href="/journal">
            ← All entries
          </ButtonLink>
        }
      />

      <div className="px-6 my-3.5 pb-8">
        {!canImport && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px] mb-3.5"
            style={{
              background: "var(--p-pending-bg)",
              color: "var(--p-pending-fg)",
              border: "1px solid var(--p-pending-fg)",
            }}
          >
            Your role can&apos;t import journal entries (requires
            journal_entry.create).
          </div>
        )}
        <ImportForm canImport={canImport} />
      </div>
    </>
  );
}
