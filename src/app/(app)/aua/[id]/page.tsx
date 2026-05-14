import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAssetById,
  getCustomers,
  getEntities,
  getSnapshotsByAssetId,
  getUserById,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import type { AssetKind } from "@/lib/types";
import { CustomFields } from "@/components/CustomFields";
import { Attachments } from "@/components/Attachments";
import {
  addSnapshotAction,
  deleteAssetAction,
  updateAssetAction,
} from "./actions";

const KIND_LABEL: Record<AssetKind, string> = {
  real_estate: "Real Estate",
  securities: "Securities",
  cash: "Cash",
  private_equity: "Private Equity",
  art: "Art",
  vehicle: "Vehicle",
  business_interest: "Business Interest",
  intellectual_property: "IP",
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
  const asset = await getAssetById(id);
  if (!asset) notFound();

  const [snapshots, entities, customers] = await Promise.all([
    getSnapshotsByAssetId(asset.id),
    getEntities(),
    getCustomers(),
  ]);
  const entity = asset.entityId
    ? entities.find((e) => e.id === asset.entityId)
    : undefined;
  const client = entity
    ? customers.find((c) => c.id === entity.clientId)
    : asset.clientId
      ? customers.find((c) => c.id === asset.clientId)
      : undefined;
  const directHold = !entity && !!asset.clientId;

  const today = new Date().toISOString().slice(0, 10);
  const latest = snapshots[0];

  // Resolve snapshot creators for the timeline
  const creatorIds = Array.from(
    new Set(snapshots.map((s) => s.createdBy).filter((x): x is string => !!x)),
  );
  const creators = await Promise.all(creatorIds.map((id) => getUserById(id)));
  const creatorById = new Map(
    creators.filter((u): u is NonNullable<typeof u> => !!u).map((u) => [u.id, u]),
  );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Assets / AUA", href: "/aua" },
          client
            ? { label: client.name, href: `/customers/${client.id}` }
            : { label: "—" },
          entity
            ? { label: entity.name, href: `/entities/${entity.id}` }
            : { label: "Direct hold" },
          { label: asset.name },
        ]}
      />
      <PageHeader
        title={asset.name}
        meta={
          entity && client
            ? `${entity.code} · ${client.name}`
            : entity?.code ?? "—"
        }
        actions={
          <ButtonLink href="/aua" variant="secondary">
            ← All assets
          </ButtonLink>
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
            <form action={updateAssetAction}>
              <input type="hidden" name="id" value={asset.id} />
              <Card title="Asset details">
                <div className="flex flex-col gap-3">
                  <Row>
                    <Field label="Name" name="name" required defaultValue={asset.name} />
                    <SelectField label="Kind" name="kind" required defaultValue={asset.kind}>
                      {Object.entries(KIND_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </SelectField>
                  </Row>
                  <Row>
                    <SelectField
                      label="Entity (preferred owner)"
                      name="entityId"
                      defaultValue={asset.entityId ?? ""}
                    >
                      <option value="">— Direct client hold (no entity) —</option>
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.code} — {e.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Client (used when no entity)"
                      name="clientId"
                      defaultValue={asset.clientId ?? ""}
                    >
                      <option value="">— None —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </SelectField>
                    <div />
                  </Row>
                  <Row>
                    <Field
                      label="External ref"
                      name="externalRef"
                      mono
                      defaultValue={asset.externalRef ?? ""}
                    />
                    <Field
                      label="Acquired date"
                      name="acquiredDate"
                      type="date"
                      defaultValue={asset.acquiredDate ?? ""}
                    />
                  </Row>
                  <TextareaField
                    label="Notes"
                    name="notes"
                    defaultValue={asset.notes ?? ""}
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

          <Card title="Latest snapshot">
            {latest ? (
              <div className="flex flex-col gap-1.5 text-[12.5px]">
                <div
                  style={{
                    fontSize: 22,
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatMoney(
                    parseAmount(latest.value),
                    latest.currencyCode || asset.currencyCode, { compact: true, paren: true },)}
                </div>
                <div style={{ color: "var(--ink-3)" }}>
                  {formatDate(latest.snapshotDate)}
                  {latest.source ? ` · ${latest.source}` : ""}
                </div>
                {latest.notes && (
                  <div style={{ color: "var(--ink-3)" }}>{latest.notes}</div>
                )}
                <div style={{ color: "var(--ink-4)", marginTop: 4 }}>
                  Recorded by{" "}
                  {latest.createdBy
                    ? (creatorById.get(latest.createdBy)?.fullName ?? "—")
                    : "—"}
                </div>
              </div>
            ) : (
              <Empty
                title="No snapshots yet"
                body="Record the first market-value snapshot below."
              />
            )}
          </Card>
        </div>

        <form action={addSnapshotAction}>
          <input type="hidden" name="assetId" value={asset.id} />
          <Card title="Record value snapshot">
            <div className="flex flex-col gap-3">
              <Row>
                <Field
                  label="Snapshot date"
                  name="snapshotDate"
                  type="date"
                  required
                  defaultValue={today}
                />
                <MoneyInput
                  label="Value"
                  name="value"
                  required
                  placeholder="0.00"
                />
              </Row>
              <Row>
                <Field
                  label="Currency"
                  name="currencyCode"
                  mono
                  defaultValue={asset.currencyCode}
                  maxLength={3}
                />
                <Field
                  label="Source"
                  name="source"
                  placeholder="Broker statement, appraisal, etc."
                />
              </Row>
              <TextareaField label="Notes" name="notes" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add snapshot
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <Card title={`Snapshot history (${snapshots.length})`}>
          {snapshots.length === 0 ? (
            <Empty title="No snapshots" body="Recorded values will appear here." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH num>Value</TH>
                  <TH>Source</TH>
                  <TH>Notes</TH>
                  <TH>Recorded by</TH>
                </TR>
              </THead>
              <TBody>
                {snapshots.map((s) => (
                  <TR key={s.id}>
                    <TD>{formatDate(s.snapshotDate)}</TD>
                    <TD num>
                      {formatMoney(
                        parseAmount(s.value),
                        s.currencyCode || asset.currencyCode, { compact: true, paren: true },)}
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>{s.source ?? "—"}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>{s.notes ?? "—"}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      {s.createdBy
                        ? (creatorById.get(s.createdBy)?.fullName ?? "—")
                        : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <CustomFields
          recordType="asset"
          recordId={asset.id}
          redirectPath={`/aua/${asset.id}`}
        />

        <Attachments
          recordType="asset"
          recordId={asset.id}
          redirectPath={`/aua/${asset.id}`}
        />

        <form action={deleteAssetAction}>
          <input type="hidden" name="id" value={asset.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting this asset removes all its snapshots permanently.
              </span>
              <ConfirmButton
                label="Delete asset"
                title={`Delete asset ${asset.name}?`}
                message="This permanently removes the asset and all of its value snapshots. This cannot be undone."
                confirmText="Delete asset"
              />
            </div>
          </Card>
        </form>

        {entity && (
          <Link
            href={`/entities/${entity.id}`}
            style={{ color: "var(--ink-3)", fontSize: 12, textDecoration: "underline" }}
          >
            View entity →
          </Link>
        )}
      </div>
    </>
  );
}
