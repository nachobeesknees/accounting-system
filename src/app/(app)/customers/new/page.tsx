import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";

export default function Page() {
  return (
    <>
      <PageHeader title="New customer" meta="Customers / New" />
      <div className="px-6 my-3.5">
        <Empty
          title="Coming soon"
          body="The new entity form will land in the next iteration."
          cta={
            <ButtonLink href="/customers" variant="secondary">
              Back to customers
            </ButtonLink>
          }
        />
      </div>
    </>
  );
}
