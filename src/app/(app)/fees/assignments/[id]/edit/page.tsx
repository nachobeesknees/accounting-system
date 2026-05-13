import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { getEntityById, getEntityFeeById } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { EditFeeForm } from "./EditFeeForm";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { error } = await searchParams;
  const fee = await getEntityFeeById(id);
  if (!fee) notFound();

  const entity = await getEntityById(fee.entityId);

  return (
    <>
      <PageHeader
        title="Edit billing schedule"
        meta={
          entity
            ? `${entity.code} · ${entity.name} · ${fee.billingYear}`
            : `Fee · ${fee.billingYear}`
        }
        actions={
          <ButtonLink
            href={`/fees/assignments/${fee.id}`}
            variant="secondary"
          >
            ← Back to assignment
          </ButtonLink>
        }
      />
      <EditFeeForm fee={fee} entity={entity ?? null} error={error ?? null} />
    </>
  );
}
