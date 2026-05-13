import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { getCustomers, getEntityById } from "@/lib/data";
import type { EntityKind } from "@/lib/types";
import { deleteEntityAction, updateEntityAction } from "./actions";

const KIND_LABEL: Record<EntityKind, string> = {
  llc: "LLC",
  trust: "Trust",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
  foundation: "Foundation",
  individual: "Individual",
  other: "Other",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const [entity, customers] = await Promise.all([
    getEntityById(id),
    getCustomers(),
  ]);
  if (!entity) notFound();
  const client = customers.find((c) => c.id === entity.clientId);

  return (
    <>
      <PageHeader
        title={entity.name}
        meta={entity.code}
        actions={
          <>
            <ButtonLink href="/entities" variant="secondary">
              ← All entities
            </ButtonLink>
            <Pill variant={statusVariant(entity.status)}>
              {statusLabel(entity.status)}
            </Pill>
          </>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}
        {saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Saved.
          </div>
        )}

        <form action={updateEntityAction}>
          <input type="hidden" name="id" value={entity.id} />
          <Card
            title="Edit entity"
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                {KIND_LABEL[entity.kind]}
                {client ? (
                  <>
                    {" · "}
                    <Link
                      href={`/customers/${client.id}`}
                      style={{ color: "var(--ink-3)" }}
                    >
                      {client.name}
                    </Link>
                  </>
                ) : null}
              </span>
            }
          >
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Code" name="code" required mono defaultValue={entity.code} />
                <Field label="Name" name="name" required defaultValue={entity.name} />
              </Row>
              <Row>
                <SelectField
                  label="Client"
                  name="clientId"
                  required
                  defaultValue={entity.clientId}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Kind" name="kind" required defaultValue={entity.kind}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Jurisdiction"
                  name="jurisdiction"
                  defaultValue={entity.jurisdiction ?? ""}
                />
                <Field
                  label="Formation date"
                  name="formationDate"
                  type="date"
                  defaultValue={entity.formationDate ?? ""}
                />
              </Row>
              <Row>
                <Field label="EIN" name="ein" mono defaultValue={entity.ein ?? ""} />
                <SelectField label="Status" name="status" defaultValue={entity.status}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="dormant">Dormant</option>
                  <option value="dissolved">Dissolved</option>
                </SelectField>
              </Row>
              <TextareaField
                label="Notes"
                name="notes"
                defaultValue={entity.notes ?? ""}
              />
            </div>
          </Card>

          <div className="flex justify-end gap-2 mt-3.5">
            <Button variant="primary" type="submit">
              Save changes
            </Button>
          </div>
        </form>

        <form action={deleteEntityAction}>
          <input type="hidden" name="id" value={entity.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting an entity is permanent. Prefer setting status to{" "}
                <em>dissolved</em> for compliance trails.
              </span>
              <Button variant="danger" type="submit">
                Delete entity
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
