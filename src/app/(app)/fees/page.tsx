import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCustomers,
  getEntities,
  getEntityFees,
  getFeeSchedules,
} from "@/lib/data";
import { formatUSD, parseAmount } from "@/lib/money";
import type { EntityKind } from "@/lib/types";

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
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "schedules" ? "schedules" : "assignments";
  const yearFilter = params.year ? parseInt(params.year, 10) : null;

  const [schedules, entityFees, entities, customers] = await Promise.all([
    getFeeSchedules(),
    getEntityFees(),
    getEntities(),
    getCustomers(),
  ]);
  const entityById = new Map(entities.map((e) => [e.id, e] as const));
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const scheduleById = new Map(schedules.map((s) => [s.id, s] as const));

  const assignments = entityFees.filter(
    (f) => !yearFilter || f.billingYear === yearFilter,
  );
  const totalBilled = assignments
    .filter((f) => f.status === "billed" || f.status === "paid")
    .reduce((s, f) => s + parseAmount(f.annualFee), 0);
  const totalUnbilled = assignments
    .filter((f) => f.status === "draft" || f.status === "active")
    .reduce((s, f) => s + parseAmount(f.annualFee), 0);

  return (
    <>
      <PageHeader
        title="Fees"
        meta={`${schedules.length} schedules · ${assignments.length} entity assignments`}
        actions={
          <>
            <ButtonLink variant="secondary" href="/fees/schedules/new">
              + New schedule
            </ButtonLink>
            <ButtonLink variant="primary" href="/fees/assignments/new">
              + Assign fee
            </ButtonLink>
          </>
        }
      />

      <Tabs
        tabs={[
          {
            id: "assignments",
            label: "Per-entity fees",
            href: "/fees?tab=assignments",
            count: assignments.length,
          },
          {
            id: "schedules",
            label: "Fee schedules",
            href: "/fees?tab=schedules",
            count: schedules.length,
          },
        ]}
        activeId={tab}
      />

      <div className="px-6 py-3.5 flex flex-col gap-3.5 pb-8">
        {tab === "assignments" && (
          <Card
            title="Per-entity fees"
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                Billed:{" "}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink)",
                  }}
                >
                  {formatUSD(totalBilled, { paren: true })}
                </span>
                {" · "}Unbilled:{" "}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink)",
                  }}
                >
                  {formatUSD(totalUnbilled, { paren: true })}
                </span>
              </span>
            }
          >
            {assignments.length === 0 ? (
              <Empty
                title="No entity fees yet"
                body="Assign an annual fee to an entity to start tracking."
                cta={
                  <ButtonLink variant="primary" href="/fees/assignments/new">
                    + Assign fee
                  </ButtonLink>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH>Year</TH>
                    <TH>Entity</TH>
                    <TH>Client</TH>
                    <TH>Schedule</TH>
                    <TH num>Annual fee</TH>
                    <TH num>Included hrs</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {assignments.map((f) => {
                    const ent = entityById.get(f.entityId);
                    const client = ent ? customerById.get(ent.clientId) : undefined;
                    const sched = f.feeScheduleId
                      ? scheduleById.get(f.feeScheduleId)
                      : undefined;
                    return (
                      <TR key={f.id} href={`/fees/assignments/${f.id}`}>
                        <TD mono>{f.billingYear}</TD>
                        <TD>
                          {ent ? (
                            <Link
                              href={`/fees/assignments/${f.id}`}
                              style={{
                                color: "var(--ink)",
                                textDecoration: "none",
                              }}
                            >
                              {ent.code} — {ent.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD style={{ color: "var(--ink-3)" }}>
                          {client?.name ?? "—"}
                        </TD>
                        <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                          {sched?.name ?? "Custom"}
                        </TD>
                        <TD num>{formatUSD(f.annualFee, { paren: true })}</TD>
                        <TD num>{parseFloat(f.includedHours).toFixed(0)}</TD>
                        <TD>
                          <Pill variant={statusVariant(f.status)}>
                            {statusLabel(f.status)}
                          </Pill>
                        </TD>
                      </TR>
                    );
                  })}
                  <TR total hover={false}>
                    <TD colSpan={4}>Totals</TD>
                    <TD num>
                      {formatUSD(
                        assignments.reduce(
                          (s, f) => s + parseAmount(f.annualFee),
                          0,
                        ),
                        { paren: true },
                      )}
                    </TD>
                    <TD num>
                      {assignments
                        .reduce((s, f) => s + parseAmount(f.includedHours), 0)
                        .toFixed(0)}
                    </TD>
                    <TD>{""}</TD>
                  </TR>
                </TBody>
              </Table>
            )}
          </Card>
        )}

        {tab === "schedules" && (
          <Card title="Fee schedules">
            {schedules.length === 0 ? (
              <Empty
                title="No fee schedules"
                body="Create reusable templates per entity kind."
                cta={
                  <ButtonLink variant="primary" href="/fees/schedules/new">
                    + New schedule
                  </ButtonLink>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH>Name</TH>
                    <TH>Kind</TH>
                    <TH num>Year</TH>
                    <TH num>Annual fee</TH>
                    <TH num>Hours included</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {schedules.map((s) => (
                    <TR key={s.id} href={`/fees/schedules/${s.id}`}>
                      <TD>
                        <Link
                          href={`/fees/schedules/${s.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {s.name}
                        </Link>
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {KIND_LABEL[s.entityKind]}
                      </TD>
                      <TD num>{s.applicableYear ?? "—"}</TD>
                      <TD num>{formatUSD(s.annualFee, { paren: true })}</TD>
                      <TD num>{parseFloat(s.includedHours).toFixed(0)}</TD>
                      <TD>
                        <Pill variant={statusVariant(s.isActive ? "active" : "inactive")}>
                          {statusLabel(s.isActive ? "active" : "inactive")}
                        </Pill>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
