import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { SmartSelectField, type SmartSelectOption } from "@/components/ui/SmartSelect";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCurrencies,
  getCustomers,
  getEntityById,
  getEntityFeesByEntityId,
  getRegionGroups,
  getRegions,
} from "@/lib/data";
import { CustomFields } from "@/components/CustomFields";
import { Attachments } from "@/components/Attachments";
import type { EntityKind } from "@/lib/types";
import { formatMoney, parseAmount } from "@/lib/money";
import { deleteEntityAction, updateEntityAction } from "./actions";

function periodCount(freq: string | null | undefined): number {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "one_time":
      return 1;
    default:
      return 1; // annual
  }
}

function frequencyLabel(freq: string | null | undefined): string {
  switch (freq) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "semiannual":
      return "Semi-annual";
    case "one_time":
      return "One-time";
    default:
      return "Annual";
  }
}

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
  const [entity, customers, currencies, fees, regions, regionGroups] =
    await Promise.all([
      getEntityById(id),
      getCustomers(),
      getCurrencies(),
      getEntityFeesByEntityId(id),
      getRegions(),
      getRegionGroups(),
    ]);
  if (!entity) notFound();
  const client = customers.find((c) => c.id === entity.clientId);
  const regionGroupById = new Map(regionGroups.map((g) => [g.id, g] as const));
  const regionsByGroup = new Map<string | null, typeof regions>();
  for (const r of regions) {
    const key = r.groupId ?? null;
    const arr = regionsByGroup.get(key) ?? [];
    arr.push(r);
    regionsByGroup.set(key, arr);
  }
  const orderedRegionGroupIds = regionGroups.map((g) => g.id);
  // Sort fees: active before draft/billed; primary services first.
  const sortedFees = [...fees].sort((a, b) => {
    const order = { active: 0, draft: 1, billed: 2, paid: 3, void: 4 } as Record<string, number>;
    return (order[a.status] ?? 99) - (order[b.status] ?? 99);
  });

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/customers" },
          client
            ? { label: client.name, href: `/customers/${client.id}` }
            : { label: "—" },
          { label: "Entities", href: "/entities" },
          { label: `${entity.code} — ${entity.name}` },
        ]}
      />
      <PageHeader
        title={entity.name}
        meta={entity.code}
        actions={
          <>
            <ButtonLink href="/entities" variant="secondary">
              ← All entities
            </ButtonLink>
            <ButtonLink href={`/entities/${entity.id}/books`} variant="primary">
              Entity books →
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
                <SmartSelectField
                  label="Client"
                  name="clientId"
                  required
                  defaultValue={entity.clientId}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    search: c.code,
                  }))}
                />
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
                <Field
                  label="Registration #"
                  name="registrationNumber"
                  mono
                  defaultValue={entity.registrationNumber ?? ""}
                  placeholder="e.g. corp filing #"
                />
              </Row>
              <Row>
                <SelectField label="Status" name="status" defaultValue={entity.status}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="dormant">Dormant</option>
                  <option value="dissolved">Dissolved</option>
                </SelectField>
              </Row>
              <Row>
                <SmartSelectField
                  label="Functional currency"
                  name="currencyCode"
                  defaultValue={entity.currencyCode}
                  options={currencies
                    .filter((c) => c.isActive || c.code === entity.currencyCode)
                    .map((c) => ({
                      value: c.code,
                      label: `${c.code} — ${c.name}`,
                      search: c.code,
                    }))}
                />
                <SmartSelectField
                  label="Region"
                  name="regionId"
                  defaultValue={entity.regionId ?? ""}
                  options={[
                    ...(regionsByGroup.get(null) ?? []).map<SmartSelectOption>(
                      (r) => ({ value: r.id, label: r.name }),
                    ),
                    ...orderedRegionGroupIds.flatMap<SmartSelectOption>(
                      (gid) => {
                        const g = regionGroupById.get(gid);
                        const rs = regionsByGroup.get(gid) ?? [];
                        if (!g) return [];
                        return rs.map((r) => ({
                          value: r.id,
                          label: r.name,
                          group: g.name,
                        }));
                      },
                    ),
                  ]}
                  emptyLabel="— None —"
                  clearable
                />
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

        <Card
          title="Services & fees"
          actions={
            <Link
              href={`/fees/assignments/new?entityId=${entity.id}`}
              style={{ color: "var(--ink-3)", textDecoration: "none" }}
            >
              + Add service →
            </Link>
          }
        >
          {sortedFees.length === 0 ? (
            <Empty
              title="No services billed for this entity yet"
              body="Use + Add service above to set up a recurring fee or one-time charge."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Service / year</TH>
                  <TH>Frequency</TH>
                  <TH>Next billing</TH>
                  <TH num>Per period</TH>
                  <TH num>Annual fee</TH>
                  <TH num>Included hrs</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {sortedFees.map((f) => {
                  const annual = parseAmount(f.annualFee);
                  const periods = periodCount(f.frequency);
                  const perPeriod = f.perPeriodAmount
                    ? parseAmount(f.perPeriodAmount)
                    : annual / periods;
                  return (
                    <TR key={f.id} href={`/fees/assignments/${f.id}`}>
                      <TD>{f.billingYear}</TD>
                      <TD>{frequencyLabel(f.frequency)}</TD>
                      <TD>{f.nextBillingDate ?? "—"}</TD>
                      <TD num>{formatMoney(perPeriod, entity.currencyCode, { compact: true })}</TD>
                      <TD num>{formatMoney(annual, entity.currencyCode, { compact: true })}</TD>
                      <TD num>{f.includedHours}</TD>
                      <TD>
                        <Pill variant={statusVariant(f.status)}>
                          {statusLabel(f.status)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <CustomFields
          recordType="entity"
          recordId={entity.id}
          redirectPath={`/entities/${entity.id}`}
        />

        <Attachments
          recordType="entity"
          recordId={entity.id}
          redirectPath={`/entities/${entity.id}`}
        />

        <form action={deleteEntityAction}>
          <input type="hidden" name="id" value={entity.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting an entity is permanent. Prefer setting status to{" "}
                <em>dissolved</em> for compliance trails.
              </span>
              <ConfirmButton
                label="Delete entity"
                title={`Delete ${entity.code} — ${entity.name}?`}
                message="This permanently removes the entity, its books scope, and any unposted JE lines tied to it. Prefer setting status to Dissolved if you need a compliance trail."
                confirmText="Delete entity"
                requirePhrase={entity.code}
              />
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
