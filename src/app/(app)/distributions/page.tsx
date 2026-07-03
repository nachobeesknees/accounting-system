import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getContacts, getDistributions, getEntities, getUsers } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getAllowedEntityIds } from "@/lib/entity-access";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import {
  DISTRIBUTION_STATUS_LABELS,
  distributionStatusVariant,
} from "@/lib/compliance";
import type { Distribution } from "@/lib/types";

function DistributionTable({
  rows,
  entityLabelById,
  contactNameById,
  userNameById,
}: {
  rows: Distribution[];
  entityLabelById: Map<string, string>;
  contactNameById: Map<string, string>;
  userNameById: Map<string, string>;
}) {
  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Number</TH>
          <TH>Entity</TH>
          <TH>Beneficiary</TH>
          <TH num>Amount</TH>
          <TH>Requested by</TH>
          <TH>Requested</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((d) => (
          <TR key={d.id} href={`/distributions/${d.id}`}>
            <TD mono>
              <Link
                href={`/distributions/${d.id}`}
                style={{ color: "var(--ink)", textDecoration: "none" }}
              >
                {d.distributionNumber}
              </Link>
            </TD>
            <TD>{entityLabelById.get(d.entityId) ?? d.entityId}</TD>
            <TD>{contactNameById.get(d.beneficiaryContactId) ?? d.beneficiaryContactId}</TD>
            <TD num>{formatMoney(d.amount, d.currencyCode, { paren: true, compact: true })}</TD>
            <TD style={{ color: "var(--ink-3)" }}>
              {d.requestedBy ? userNameById.get(d.requestedBy) ?? d.requestedBy : "—"}
            </TD>
            <TD style={{ color: "var(--ink-3)" }}>
              {formatDate(d.requestedAt.slice(0, 10))}
            </TD>
            <TD>
              <Pill variant={distributionStatusVariant(d.status)}>
                {DISTRIBUTION_STATUS_LABELS[d.status] ?? d.status}
              </Pill>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * Distributions register, grouped by approval stage. Dual approval:
 * requested → first_approved → approved (ready to pay) → paid, with
 * rejection possible at any pre-paid stage.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [allDistributions, entities, contacts, users, allowedEntityIds] =
    await Promise.all([
      getDistributions(),
      getEntities(),
      getContacts(),
      getUsers(),
      getAllowedEntityIds(user),
    ]);
  // user_entity_access scoping — same convention as /entities and /journal.
  const distributions =
    allowedEntityIds === null
      ? allDistributions
      : allDistributions.filter((d) => allowedEntityIds.has(d.entityId));

  const canCreate = hasPermission(user, "distribution.create");
  const entityLabelById = new Map(
    entities.map((e) => [e.id, `${e.code} — ${e.name}`] as const),
  );
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name] as const));
  const userNameById = new Map(users.map((u) => [u.id, u.fullName] as const));

  const groups: Array<{ title: string; statuses: string[]; pill?: "pending" | "formation" }> = [
    { title: "Awaiting first approval", statuses: ["requested"], pill: "pending" },
    { title: "Awaiting second approval", statuses: ["first_approved"], pill: "pending" },
    { title: "Ready to pay", statuses: ["approved"], pill: "formation" },
    { title: "Paid", statuses: ["paid"] },
    { title: "Rejected / void", statuses: ["rejected", "void"] },
  ];

  const tableProps = { entityLabelById, contactNameById, userNameById };

  return (
    <>
      <PageHeader
        title="Distributions"
        meta={`${distributions.length} on record · dual approval required before payment`}
        actions={
          canCreate ? (
            <ButtonLink variant="primary" href="/distributions/new">
              + New distribution
            </ButtonLink>
          ) : undefined
        }
      />

      {params.error && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {params.error}
        </div>
      )}

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        {distributions.length === 0 && (
          <Card title="Distributions">
            <Empty
              title="No distributions yet"
              body="Beneficiary payouts from client entities are requested here, then pass dual approval before payment."
              cta={
                canCreate ? (
                  <ButtonLink variant="primary" href="/distributions/new">
                    + New distribution
                  </ButtonLink>
                ) : undefined
              }
            />
          </Card>
        )}

        {groups.map((g) => {
          const rows = distributions.filter((d) => g.statuses.includes(d.status));
          if (rows.length === 0) return null;
          return (
            <Card
              key={g.title}
              title={g.title}
              actions={
                g.pill ? (
                  <Pill variant={g.pill}>
                    {rows.length} distribution{rows.length === 1 ? "" : "s"}
                  </Pill>
                ) : (
                  <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                    {rows.length} distribution{rows.length === 1 ? "" : "s"}
                  </span>
                )
              }
            >
              <DistributionTable rows={rows} {...tableProps} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
