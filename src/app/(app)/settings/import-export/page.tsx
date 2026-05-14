import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { getSessionUser } from "@/lib/session";
import { ADAPTERS } from "@/lib/csv-adapters";
import { ImportExportClient } from "./ImportExportClient";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isSuperuser) {
    return (
      <>
        <PageHeader title="Import / Export" meta="Admin only" />
        <div className="px-6 my-3.5">
          <Card title="Restricted">
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              CSV import/export is restricted to administrators. Ask your
              workspace admin (any user with isSuperuser) to perform bulk
              imports on your behalf.
            </p>
          </Card>
        </div>
      </>
    );
  }

  const types = Object.values(ADAPTERS).map((a) => ({
    key: a.key,
    label: a.label,
    description: a.description,
  }));

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Import / Export" },
        ]}
      />
      <PageHeader
        title="Import / Export"
        meta="Settings · CSV bulk operations · admin only"
      />
      <div className="px-6 my-3.5 pb-8">
        <ImportExportClient types={types} />
      </div>
    </>
  );
}
