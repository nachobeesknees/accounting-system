import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";

export default function Page() {
  return (
    <>
      <PageHeader title="New bill" meta="Bills / New" />
      <div className="px-6 my-3.5">
        <Empty
          title="Coming soon"
          body="The new entity form will land in the next iteration."
          cta={
            <ButtonLink href="/bills" variant="secondary">
              Back to bills
            </ButtonLink>
          }
        />
      </div>
    </>
  );
}
