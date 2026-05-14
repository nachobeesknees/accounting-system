import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { Field, SelectField } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { IconBookOpen } from "@/components/ui/Icon";
import {
  DEMO_TODAY,
  getJournalEntries,
  getJournalEntryTemplates,
  totalDebits,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { getAllowedEntityIds } from "@/lib/entity-access";
import { formatMoney } from "@/lib/money";
import type { JournalEntry } from "@/lib/types";
import { DrillNumber } from "@/components/DrillNumber";
import {
  duplicateJournalEntryAction,
  generateNextRecurringEntryAction,
} from "../duplicate-actions";

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function frequencyLabel(f: string | null | undefined): string {
  switch (f) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "annually":
      return "Annually";
    case "custom":
      return "Custom";
    default:
      return "—";
  }
}

function isTemplateDue(t: JournalEntry, todayIso: string): boolean {
  if (!t.recurringNextDate) return false;
  if (t.recurringEndDate && t.recurringNextDate > t.recurringEndDate) {
    return false;
  }
  return t.recurringNextDate <= todayIso;
}

function filterEntries(
  entries: JournalEntry[],
  q: string,
  status: string,
  source: string,
  accountId: string,
  entityFilter: string,
): JournalEntry[] {
  const needle = q.trim().toLowerCase();
  return entries.filter((e) => {
    if (status && e.status !== status) return false;
    if (source && e.source !== source) return false;
    // Account drill-down: keep entries that touch the given account on
    // any line. Used by DrillNumber on Trial Balance / IS / BS rows.
    if (accountId && !e.lines.some((l) => l.accountId === accountId)) return false;
    // Entity drill-down. `firm` → entries with no entity (firm-level
    // unattributed); anything else → that entity id. Used by the
    // dashboard's per-entity P&L card to drill into the firm-level row.
    if (entityFilter === "firm") {
      if (e.entityId != null) return false;
    } else if (entityFilter) {
      if (e.entityId !== entityFilter) return false;
    }
    if (needle) {
      const hay =
        `${e.entryNumber} ${e.description ?? ""} ${e.reference ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
    account?: string;
    entity?: string;
    from?: string;
    to?: string;
    view?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "";
  const source = params.source ?? "";
  const accountId = params.account ?? "";
  const entityFilter = params.entity ?? "";
  const view = params.view === "templates" ? "templates" : "entries";
  const error = params.error ?? "";

  const user = await getSessionUser();
  const [allEntriesRaw, templates, allowedEntityIds] = await Promise.all([
    getJournalEntries(),
    getJournalEntryTemplates(),
    getAllowedEntityIds(user),
  ]);
  // user_entity_access — drop JEs tagged to a client entity outside the
  // user's scope. Firm-level (entityId null) entries are always visible.
  const allEntries =
    allowedEntityIds === null
      ? allEntriesRaw
      : allEntriesRaw.filter(
          (e) => e.entityId == null || allowedEntityIds.has(e.entityId),
        );
  const todayIso = DEMO_TODAY.toISOString().slice(0, 10);
  const dueTemplates = templates.filter((t) => isTemplateDue(t, todayIso));

  const entries = filterEntries(allEntries, q, status, source, accountId, entityFilter);
  const grandTotal = entries.reduce((s, e) => s + totalDebits(e), 0);

  return (
    <>
      <PageHeader
        title="Journal Entries"
        meta={
          view === "templates"
            ? `${templates.length} template${templates.length === 1 ? "" : "s"}`
            : `${allEntries.length} entries this period`
        }
        actions={
          <ButtonLink variant="primary" href="/journal/new">
            + New entry
          </ButtonLink>
        }
      />

      <Tabs
        tabs={[
          {
            id: "entries",
            label: "Entries",
            href: "/journal",
            count: allEntries.length,
          },
          {
            id: "templates",
            label: "Templates",
            href: "/journal?view=templates",
            count: templates.length,
          },
        ]}
        activeId={view}
      />

      {error && (
        <div className="px-6 pt-3.5">
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
        </div>
      )}

      {view === "entries" && dueTemplates.length > 0 && (
        <div className="px-6 pt-3.5">
          <div
            className="rounded-md px-3 py-2 flex items-center justify-between"
            style={{
              background: "var(--p-pending-bg)",
              color: "var(--p-pending-fg)",
              border: "1px solid var(--p-pending-fg)",
              fontSize: 12.5,
            }}
          >
            <span>
              {dueTemplates.length} recurring template
              {dueTemplates.length === 1 ? " is" : "s are"} due for posting.
            </span>
            <Link
              href="/journal?view=templates"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              Review templates →
            </Link>
          </div>
        </div>
      )}

      {view === "entries" ? (
        <>
          <div
            className="px-6 py-2 flex gap-2 flex-wrap items-end"
            style={{
              background: "var(--rail)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <form method="GET" className="flex gap-2 flex-wrap items-end">
              <Field
                label="Search"
                name="q"
                placeholder="Search description, reference, or entry #"
                defaultValue={q}
              />
              <SelectField label="Status" name="status" defaultValue={status}>
                <option value="">All</option>
                <option value="posted">Posted</option>
                <option value="draft">Draft</option>
                <option value="void">Void</option>
              </SelectField>
              <SelectField label="Source" name="source" defaultValue={source}>
                <option value="">All</option>
                <option value="manual">Manual</option>
                <option value="invoice">Invoice</option>
                <option value="bill">Bill</option>
                <option value="reconciliation">Reconciliation</option>
              </SelectField>
              <Button variant="primary" type="submit">
                Apply
              </Button>
              <ButtonLink variant="ghost" href="/journal">
                Reset
              </ButtonLink>
            </form>
          </div>

          <div className="px-6 py-3.5 pb-8">
            <Card title="Entries">
              {entries.length === 0 ? (
                <Empty
                  icon={<IconBookOpen size={20} />}
                  title={
                    allEntries.length === 0
                      ? "No journal entries yet"
                      : "No journal entries match these filters"
                  }
                  body={
                    allEntries.length === 0
                      ? "Journal entries are how movement enters the books — created by hand or auto-generated from invoices, bills, and payments."
                      : "Try clearing the filters or create a new entry."
                  }
                  cta={
                    <ButtonLink variant="primary" href="/journal/new">
                      + New entry
                    </ButtonLink>
                  }
                />
              ) : (
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Entry #</TH>
                      <TH>Date</TH>
                      <TH>Description</TH>
                      <TH>Reference</TH>
                      <TH>Source</TH>
                      <TH>Status</TH>
                      <TH num>Total</TH>
                      <TH>{""}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {entries.map((e) => (
                      <TR key={e.id} href={`/journal/${e.entryNumber}`}>
                        <TD mono>
                          <Link
                            href={`/journal/${e.entryNumber}`}
                            style={{
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            {e.entryNumber}
                          </Link>
                        </TD>
                        <TD>{formatShortDate(e.entryDate)}</TD>
                        <TD>{e.description ?? "—"}</TD>
                        <TD mono style={{ color: "var(--ink-3)" }}>
                          {e.reference ?? "—"}
                        </TD>
                        <TD
                          style={{
                            color: "var(--ink-3)",
                            fontSize: 11.5,
                            textTransform: "capitalize",
                          }}
                        >
                          {e.source}
                        </TD>
                        <TD>
                          <Pill variant={statusVariant(e.status)}>
                            {statusLabel(e.status)}
                          </Pill>
                        </TD>
                        <TD num>
                          <DrillNumber
                            value={totalDebits(e)}
                            href={`/journal/${e.entryNumber}`}
                            currencyCode={null}
                            compact
                          />
                        </TD>
                        <TD>
                          <form action={duplicateJournalEntryAction}>
                            <input type="hidden" name="entryId" value={e.id} />
                            <button
                              type="submit"
                              title="Duplicate as draft"
                              style={{
                                background: "transparent",
                                border: "1px solid var(--line-2)",
                                borderRadius: 4,
                                color: "var(--ink-3)",
                                cursor: "pointer",
                                fontSize: 11,
                                padding: "1px 6px",
                              }}
                            >
                              Duplicate
                            </button>
                          </form>
                        </TD>
                      </TR>
                    ))}
                    <TR total hover={false}>
                      <TD>Total</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD>{""}</TD>
                      <TD num>{formatMoney(grandTotal, "USD", { compact: true })}</TD>
                      <TD>{""}</TD>
                    </TR>
                  </TBody>
                </Table>
              )}
            </Card>
          </div>
        </>
      ) : (
        <div className="px-6 py-3.5 pb-8">
          <Card
            title="Recurring templates"
            actions={
              dueTemplates.length > 0 ? (
                <Pill variant="pending">{dueTemplates.length} due</Pill>
              ) : null
            }
          >
            {templates.length === 0 ? (
              <Empty
                icon={<IconBookOpen size={20} />}
                title="No recurring templates yet"
                body="Save a journal entry with the Recurring toggle on to create a template. Generated entries land as drafts so you can review before posting."
                cta={
                  <ButtonLink variant="primary" href="/journal/new">
                    + New entry
                  </ButtonLink>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH>Template #</TH>
                    <TH>Description</TH>
                    <TH>Frequency</TH>
                    <TH>Next due</TH>
                    <TH>End date</TH>
                    <TH num>Total</TH>
                    <TH>{""}</TH>
                  </TR>
                </THead>
                <TBody>
                  {templates.map((t) => {
                    const due = isTemplateDue(t, todayIso);
                    const ended =
                      t.recurringEndDate != null &&
                      t.recurringNextDate != null &&
                      t.recurringNextDate > t.recurringEndDate;
                    return (
                      <TR key={t.id} href={`/journal/${t.entryNumber}`}>
                        <TD mono>
                          <Link
                            href={`/journal/${t.entryNumber}`}
                            style={{
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            {t.entryNumber}
                          </Link>
                        </TD>
                        <TD>{t.description ?? "—"}</TD>
                        <TD>{frequencyLabel(t.recurringFrequency)}</TD>
                        <TD>
                          {t.recurringNextDate ? (
                            <span
                              style={{
                                color: due
                                  ? "var(--p-review-fg)"
                                  : "var(--ink)",
                                fontWeight: due ? 500 : 400,
                              }}
                            >
                              {formatShortDate(t.recurringNextDate)}
                              {due && (
                                <span
                                  style={{
                                    color: "var(--p-review-fg)",
                                    fontSize: 11,
                                    marginLeft: 6,
                                  }}
                                >
                                  due
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD>
                          {t.recurringEndDate
                            ? formatShortDate(t.recurringEndDate)
                            : "—"}
                        </TD>
                        <TD num>
                          <DrillNumber
                            value={totalDebits(t)}
                            href={`/journal/${t.entryNumber}`}
                            currencyCode={null}
                            compact
                          />
                        </TD>
                        <TD>
                          <form action={generateNextRecurringEntryAction}>
                            <input
                              type="hidden"
                              name="templateId"
                              value={t.id}
                            />
                            <button
                              type="submit"
                              disabled={ended || !t.recurringNextDate}
                              title={
                                ended
                                  ? "Template has ended"
                                  : "Generate next entry"
                              }
                              style={{
                                background: due
                                  ? "var(--ink)"
                                  : "transparent",
                                border: "1px solid var(--line-2)",
                                borderRadius: 4,
                                color: due ? "var(--paper)" : "var(--ink-3)",
                                cursor:
                                  ended || !t.recurringNextDate
                                    ? "not-allowed"
                                    : "pointer",
                                opacity:
                                  ended || !t.recurringNextDate ? 0.4 : 1,
                                fontSize: 11,
                                padding: "2px 8px",
                              }}
                            >
                              Generate next entry
                            </button>
                          </form>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
