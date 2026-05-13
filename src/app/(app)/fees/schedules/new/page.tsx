import { PageHeader } from "@/components/ui/PageHeader";
import { NewScheduleForm } from "./NewScheduleForm";

export default function Page() {
  return (
    <>
      <PageHeader title="New fee schedule" meta="Fees / Schedules / New" />
      <NewScheduleForm />
    </>
  );
}
