import { notFound, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { getEntities, getEntityFilingById, getUserById, getUsers } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getAllowedEntityIds } from "@/lib/entity-access";
import { formatDate } from "@/lib/format";
import {
  FILING_KINDS,
  FILING_KIND_LABELS,
  FILING_RECURRENCES,
  FILING_RECURRENCE_LABELS,
  isOpenFilingStatus,
  todayIso,
} from "@/lib/compliance";
import {
  deleteFilingAction,
  markFilingFiledAction,
  updateFilingAction,
  waiveFilingAction,
} from "../actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; returnTo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "filing.write")) redirect("/filings");

  const filing = await getEntityFilingById(id);
  if (!filing) notFound();

  const [entities, users, completedByUser, allowedEntityIds] = await Promise.all([
    getEntities(),
    getUsers(),
    filing.completedBy ? getUserById(filing.completedBy) : Promise.resolve(undefined),
    getAllowedEntityIds(user),
  ]);
  // user_entity_access scoping — out-of-scope entities 404, matching /entities/[id].
  if (allowedEntityIds !== null && !allowedEntityIds.has(filing.entityId)) {
    notFound();
  }
  const entity = entities.find((e) => e.id === filing.entityId);
  const open = isOpenFilingStatus(filing.status);
  const overdue = open && filing.dueDate < todayIso();
  const returnTo =
    sp.returnTo && sp.returnTo.startsWith("/") ? sp.returnTo : "/filings";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Filings", href: "/filings" },
          entity
            ? { label: `${entity.code} — ${entity.name}`, href: `/entities/${entity.id}` }
            : { label: "—" },
          { label: filing.title },
        ]}
      />
      <PageHeader
        title={filing.title}
        meta={`${FILING_KIND_LABELS[filing.kind]}${filing.jurisdiction ? ` · ${filing.jurisdiction}` : ""}`}
        actions={
          <>
            <ButtonLink variant="secondary" href={returnTo}>
              ← Back
            </ButtonLink>
            <Pill variant={overdue ? "review" : statusVariant(filing.status)}>
              {overdue ? "Overdue" : statusLabel(filing.status)}
            </Pill>
          </>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {sp.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {sp.error}
          </div>
        )}
        {sp.saved && (
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

        {filing.completedAt && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--rail)",
              color: "var(--ink-3)",
              border: "1px solid var(--line)",
            }}
          >
            {statusLabel(filing.status)} on{" "}
            {formatDate(filing.completedAt.slice(0, 10))}
            {completedByUser ? ` by ${completedByUser.fullName}` : ""}.
          </div>
        )}

        <form action={updateFilingAction}>
          <input type="hidden" name="id" value={filing.id} />
          <input type="hidden" name="returnTo" value={`/filings/${filing.id}`} />
          <Card title="Edit filing">
            <div className="flex flex-col gap-3 p-3.5">
              <Row>
                <SmartSelectField
                  label="Entity"
                  name="entityId"
                  required
                  defaultValue={filing.entityId}
                  options={entities.map((e) => ({
                    value: e.id,
                    label: `${e.code} — ${e.name}`,
                  }))}
                />
                <SelectField label="Kind" name="kind" required defaultValue={filing.kind}>
                  {FILING_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FILING_KIND_LABELS[k]}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <Field label="Title" name="title" required defaultValue={filing.title} />
                <Field
                  label="Jurisdiction"
                  name="jurisdiction"
                  defaultValue={filing.jurisdiction ?? ""}
                />
              </Row>
              <Row>
                <Field
                  label="Due date"
                  name="dueDate"
                  type="date"
                  required
                  defaultValue={filing.dueDate}
                />
                <SelectField
                  label="Recurrence"
                  name="recurrence"
                  defaultValue={filing.recurrence}
                >
                  {FILING_RECURRENCES.map((r) => (
                    <option key={r} value={r}>
                      {FILING_RECURRENCE_LABELS[r]}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <SmartSelectField
                  label="Owner"
                  name="ownerUserId"
                  defaultValue={filing.ownerUserId ?? ""}
                  options={users.map((u) => ({
                    value: u.id,
                    label: u.fullName,
                    description: `· ${u.role}`,
                    search: u.email,
                  }))}
                  emptyLabel="— Unassigned —"
                  clearable
                />
                {/* Completion (Filed / Waived) goes through the Actions card —
                    markFilingFiled / waiveEntityFiling stamp who/when and
                    schedule the next occurrence. The edit form only moves
                    between open statuses (or reopens a completed filing). */}
                <SelectField label="Status" name="status" defaultValue={filing.status}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  {!open && (
                    <option value={filing.status}>{statusLabel(filing.status)}</option>
                  )}
                </SelectField>
              </Row>
              <TextareaField label="Notes" name="notes" defaultValue={filing.notes ?? ""} />
            </div>
          </Card>
          <div className="flex justify-end gap-2 mt-3.5">
            <Button variant="primary" type="submit">
              Save changes
            </Button>
          </div>
        </form>

        {open && (
          <Card title="Actions">
            <div className="flex items-center gap-2 p-3.5 flex-wrap">
              <form action={markFilingFiledAction}>
                <input type="hidden" name="id" value={filing.id} />
                <input type="hidden" name="entityId" value={filing.entityId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="primary" type="submit">
                  Mark filed
                </Button>
              </form>
              <form action={waiveFilingAction}>
                <input type="hidden" name="id" value={filing.id} />
                <input type="hidden" name="entityId" value={filing.entityId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="secondary" type="submit">
                  Waive
                </Button>
              </form>
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                Marking a recurring filing as filed automatically schedules the
                next occurrence ({FILING_RECURRENCE_LABELS[filing.recurrence]}).
              </span>
            </div>
          </Card>
        )}

        <form action={deleteFilingAction}>
          <input type="hidden" name="id" value={filing.id} />
          <input type="hidden" name="entityId" value={filing.entityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px] p-3.5">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting a filing is permanent. Prefer waiving it to keep a
                compliance trail.
              </span>
              <ConfirmButton
                label="Delete filing"
                title={`Delete "${filing.title}"?`}
                message="This permanently removes the filing from the compliance calendar. Prefer waiving to keep an audit trail."
                confirmText="Delete filing"
              />
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
