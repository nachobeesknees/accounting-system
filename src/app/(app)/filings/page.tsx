import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { FilingsTable } from "@/components/compliance/FilingsTable";
import { getEntities, getEntityFilings, getUsers } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getAllowedEntityIds } from "@/lib/entity-access";
import { addDaysIso, isOpenFilingStatus, todayIso } from "@/lib/compliance";

/**
 * Firm-wide compliance calendar. Every statutory filing / renewal across
 * all client entities, grouped by urgency. "Overdue" is derived from
 * due_date on open (pending / in_progress) rows; the Filed & waived
 * history stays collapsed at the bottom.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [allFilings, entities, users, allowedEntityIds] = await Promise.all([
    getEntityFilings(),
    getEntities(),
    getUsers(),
    getAllowedEntityIds(user),
  ]);
  // user_entity_access scoping — same convention as /entities and /journal.
  const filings =
    allowedEntityIds === null
      ? allFilings
      : allFilings.filter((f) => allowedEntityIds.has(f.entityId));

  const canWrite = hasPermission(user, "filing.write");
  const entityLabelById = new Map(
    entities.map((e) => [e.id, `${e.code} — ${e.name}`] as const),
  );
  const userNameById = new Map(users.map((u) => [u.id, u.fullName] as const));

  const today = todayIso();
  const horizon = addDaysIso(today, 30);

  const open = filings.filter((f) => isOpenFilingStatus(f.status));
  const overdue = open.filter((f) => f.dueDate < today);
  const dueSoon = open.filter((f) => f.dueDate >= today && f.dueDate <= horizon);
  const later = open.filter((f) => f.dueDate > horizon);
  const history = filings
    .filter((f) => !isOpenFilingStatus(f.status))
    .slice()
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  const tableProps = { entityLabelById, userNameById, canWrite, returnTo: "/filings" };

  return (
    <>
      <PageHeader
        title="Filings Calendar"
        meta={`${open.length} open · ${overdue.length} overdue`}
        actions={
          canWrite ? (
            <ButtonLink variant="primary" href="/filings/new">
              + New filing
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
      {params.saved && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-active-bg)",
            color: "var(--p-active-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          Saved.
        </div>
      )}

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        {open.length === 0 && history.length === 0 && (
          <Card title="Compliance calendar">
            <Empty
              title="No filings tracked yet"
              body="Track annual returns, license and agent renewals, FATCA/CRS, tax returns, and economic-substance filings per client entity."
              cta={
                canWrite ? (
                  <ButtonLink variant="primary" href="/filings/new">
                    + New filing
                  </ButtonLink>
                ) : undefined
              }
            />
          </Card>
        )}

        {overdue.length > 0 && (
          <Card
            title="Overdue"
            actions={<Pill variant="review">{overdue.length} overdue</Pill>}
          >
            <FilingsTable filings={overdue} {...tableProps} />
          </Card>
        )}

        {dueSoon.length > 0 && (
          <Card
            title="Due in 30 days"
            actions={<Pill variant="pending">{dueSoon.length} due</Pill>}
          >
            <FilingsTable filings={dueSoon} {...tableProps} />
          </Card>
        )}

        {later.length > 0 && (
          <Card title="Later">
            <FilingsTable filings={later} {...tableProps} />
          </Card>
        )}

        {history.length > 0 && (
          <details>
            <summary
              className="cursor-pointer text-[12.5px] px-1 py-1"
              style={{ color: "var(--ink-3)" }}
            >
              Filed & waived history ({history.length})
            </summary>
            <div className="mt-2">
              <Card title="Filed & waived">
                <FilingsTable filings={history} {...tableProps} />
              </Card>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
