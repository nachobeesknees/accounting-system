import { redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { getEntities, getUsers } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import {
  FILING_KINDS,
  FILING_KIND_LABELS,
  FILING_RECURRENCES,
  FILING_RECURRENCE_LABELS,
} from "@/lib/compliance";
import { createFilingAction } from "../actions";

/**
 * New-filing form. `?entity=<id>` preselects the entity (used by the
 * add-filing shortcut on the entity detail page); `?returnTo=` controls
 * where the save lands.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "filing.write")) redirect("/filings");

  const [entities, users] = await Promise.all([getEntities(), getUsers()]);
  const preselect = params.entity ?? "";
  const returnTo =
    params.returnTo && params.returnTo.startsWith("/") ? params.returnTo : "/filings";

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Filings", href: "/filings" }, { label: "New filing" }]}
      />
      <PageHeader
        title="New filing"
        meta="Statutory filing / renewal for a client entity"
        actions={
          <ButtonLink variant="secondary" href="/filings">
            ← Filings calendar
          </ButtonLink>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {params.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {params.error}
          </div>
        )}

        <form action={createFilingAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <Card title="Filing details">
            <div className="flex flex-col gap-3 p-3.5">
              <Row>
                <SmartSelectField
                  label="Entity"
                  name="entityId"
                  required
                  defaultValue={preselect}
                  options={entities.map((e) => ({
                    value: e.id,
                    label: `${e.code} — ${e.name}`,
                    search: e.jurisdiction ?? undefined,
                  }))}
                  emptyLabel="Pick an entity…"
                />
                <SelectField label="Kind" name="kind" required defaultValue="annual_return">
                  {FILING_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FILING_KIND_LABELS[k]}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Title"
                  name="title"
                  required
                  placeholder="e.g. 2026 Annual return — Companies Office"
                />
                <Field
                  label="Jurisdiction"
                  name="jurisdiction"
                  placeholder="e.g. New Zealand / Delaware / Hong Kong"
                />
              </Row>
              <Row>
                <Field label="Due date" name="dueDate" type="date" required />
                <SelectField label="Recurrence" name="recurrence" defaultValue="none">
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
                  options={users.map((u) => ({
                    value: u.id,
                    label: u.fullName,
                    description: `· ${u.role}`,
                    search: u.email,
                  }))}
                  emptyLabel="— Unassigned —"
                  clearable
                />
                <div />
              </Row>
              <TextareaField
                label="Notes"
                name="notes"
                placeholder="Registered agent, portal logins, filing fees…"
              />
            </div>
          </Card>
          <div className="flex justify-end gap-2 mt-3.5">
            <ButtonLink variant="secondary" href={returnTo}>
              Cancel
            </ButtonLink>
            <Button variant="primary" type="submit">
              Create filing
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
