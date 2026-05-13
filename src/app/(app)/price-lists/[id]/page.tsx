import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getOfficeById,
  getPriceListById,
  getPriceListEntries,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD } from "@/lib/money";
import type { PriceListItemType } from "@/lib/types";
import {
  addEntryAction,
  clonePriceListAction,
  deleteEntryAction,
  deletePriceListAction,
  updatePriceListAction,
} from "./actions";

const TYPE_LABEL: Record<PriceListItemType, string> = {
  entity_fee: "Entity fee",
  time_rate: "Hourly rate",
  service: "Service",
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
  const priceList = await getPriceListById(id);
  if (!priceList) notFound();

  const [office, entries] = await Promise.all([
    getOfficeById(priceList.officeId),
    getPriceListEntries(priceList.id),
  ]);

  const cloneDefault = `${priceList.name.replace(/v\d+/, "")} v${priceList.versionNumber + 1}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Price Lists", href: "/price-lists" },
          { label: priceList.name },
        ]}
      />
      <PageHeader
        title={priceList.name}
        meta={office ? `${office.code} — ${office.name} · v${priceList.versionNumber}` : `v${priceList.versionNumber}`}
        actions={
          <>
            <ButtonLink href="/price-lists" variant="secondary">
              ← All price lists
            </ButtonLink>
            {priceList.isCurrent ? (
              <Pill variant="active">Current</Pill>
            ) : (
              <Pill variant="neutral">Historical</Pill>
            )}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="md:col-span-2">
            <form action={updatePriceListAction}>
              <input type="hidden" name="id" value={priceList.id} />
              <Card title="Edit price list">
                <div className="flex flex-col gap-3">
                  <Row>
                    <Field label="Name" name="name" required defaultValue={priceList.name} />
                    <Field
                      label="Version"
                      name="versionNumber"
                      mono
                      type="number"
                      defaultValue={String(priceList.versionNumber)}
                    />
                  </Row>
                  <Row>
                    <Field
                      label="Effective date"
                      name="effectiveDate"
                      type="date"
                      required
                      defaultValue={priceList.effectiveDate}
                    />
                    <label className="flex items-end gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        name="isCurrent"
                        defaultChecked={priceList.isCurrent}
                      />
                      <span style={{ color: "var(--ink-2)" }}>
                        Current version for this office
                      </span>
                    </label>
                  </Row>
                  <Row>
                    <label className="flex items-end gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={priceList.isActive}
                      />
                      <span style={{ color: "var(--ink-2)" }}>Active</span>
                    </label>
                    <div style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      Parent version: {priceList.parentVersionId ?? "—"}
                    </div>
                  </Row>
                  <TextareaField
                    label="Notes"
                    name="notes"
                    defaultValue={priceList.notes ?? ""}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-3.5">
                  <Button variant="primary" type="submit">
                    Save changes
                  </Button>
                </div>
              </Card>
            </form>
          </div>

          <form action={clonePriceListAction}>
            <input type="hidden" name="id" value={priceList.id} />
            <Card title="Duplicate as new version">
              <div className="flex flex-col gap-2">
                <Field
                  label="New name"
                  name="name"
                  defaultValue={cloneDefault}
                />
                <Field
                  label="Effective date"
                  name="effectiveDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
                <label className="flex items-end gap-2 text-[13px] mt-1">
                  <input type="checkbox" name="setCurrent" />
                  <span style={{ color: "var(--ink-2)" }}>
                    Promote the new version to current
                  </span>
                </label>
                <div className="flex justify-end">
                  <Button variant="primary" type="submit">
                    Duplicate
                  </Button>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                  Copies every entry; version number is bumped to{" "}
                  {priceList.versionNumber + 1}.
                </div>
              </div>
            </Card>
          </form>
        </div>

        <Card
          title={`Entries (${entries.length})`}
          actions={
            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
              Effective {formatDate(priceList.effectiveDate)}
            </span>
          }
        >
          {entries.length === 0 ? (
            <Empty
              title="No entries"
              body="Add entity-fee, time-rate, or service entries below."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Type</TH>
                  <TH>Key</TH>
                  <TH>Label</TH>
                  <TH num>Unit price</TH>
                  <TH num>Included qty</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Pill variant={statusVariant(e.itemType === "entity_fee" ? "active" : "neutral")}>
                        {statusLabel(TYPE_LABEL[e.itemType])}
                      </Pill>
                    </TD>
                    <TD mono>{e.itemKey}</TD>
                    <TD>{e.label}</TD>
                    <TD num>{formatUSD(e.unitPrice, { paren: true })}</TD>
                    <TD num style={{ color: "var(--ink-3)" }}>
                      {e.includedQuantity ?? "—"}
                    </TD>
                    <TD>
                      <form action={deleteEntryAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="priceListId" value={priceList.id} />
                        <ConfirmButton
                          variant="ghost"
                          title={`Remove ${e.label}?`}
                          body="Removes this entry from the price list. Existing assignments that priced off this entry continue to use their captured rate."
                          confirmLabel="Remove entry"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={addEntryAction}>
          <input type="hidden" name="priceListId" value={priceList.id} />
          <Card title="Add entry">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="Type" name="itemType" required defaultValue="entity_fee">
                  <option value="entity_fee">Entity fee</option>
                  <option value="time_rate">Hourly rate</option>
                  <option value="service">Service</option>
                </SelectField>
                <Field
                  label="Key"
                  name="itemKey"
                  required
                  mono
                  placeholder="llc / trust / Bookkeeper / fund-admin"
                />
              </Row>
              <Row>
                <Field label="Label" name="label" required placeholder="What appears on the invoice" />
                <Field
                  label="Unit price"
                  name="unitPrice"
                  required
                  mono
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </Row>
              <Row>
                <Field
                  label="Included quantity (optional)"
                  name="includedQuantity"
                  mono
                  inputMode="decimal"
                />
                <Field label="Notes" name="notes" />
              </Row>
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add entry
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <form action={deletePriceListAction}>
          <input type="hidden" name="id" value={priceList.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting this price list removes its entries permanently. Prefer
                marking inactive for compliance trails.
              </span>
              <ConfirmButton
                variant="danger"
                title={`Delete price list ${priceList.name}?`}
                body="Permanently removes this price list and all of its entries. Customer assignments referencing it will fall back to default pricing."
                confirmLabel="Delete price list"
              >
                Delete price list
              </ConfirmButton>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
