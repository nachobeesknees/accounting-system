import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { NewScheduleForm } from "./NewScheduleForm";

export default function Page() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Fees", href: "/fees" },
          { label: "Schedules", href: "/fees?tab=schedules" },
          { label: "New" },
        ]}
      />
      <PageHeader title="New fee schedule" />
      <NewScheduleForm />
    </>
  );
}
