import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCustomers,
  getEntities,
  getTimeEntries,
  getUsers,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import type { TimeEntry } from "@/lib/types";

function filterEntries(
  entries: TimeEntry[],
  q: string,
  userId: string,
  clientId: string,
  billable: string,
): TimeEntry[] {
  const needle = q.trim().toLowerCase();
  return entries.filter((t) => {
    if (userId && t.userId !== userId) return false;
    if (clientId && t.clientId !== clientId) return false;
    if (billable === "yes" && !t.isBillable) return false;
    if (billable === "no" && t.isBillable) return false;
    if (needle && !t.description.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; user?: string; client?: string; billable?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const userId = params.user ?? "";
  const clientId = params.client ?? "";
  const billable = params.billable ?? "";

  const [allEntries, users, customers, entities] = await Promise.all([
    getTimeEntries(),
    getUsers(),
    getCustomers(),
    getEntities(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const entityById = new Map(entities.map((e) => [e.id, e] as const));

  const rows = filterEntries(allEntries, q, userId, clientId, billable);
  const totalHours = rows.reduce((s, t) => s + parseAmount(t.durationHours), 0);
  const billableValue = rows
    .filter((t) => t.isBillable)
    .reduce(
      (s, t) =>
        s +
        parseAmount(t.durationHours) *
          (t.rateAtLog ? parseAmount(t.rateAtLog) : 0),
      0,
    );
  const billableHours = rows
    .filter((t) => t.isBillable)
    .reduce((s, t) => s + parseAmount(t.durationHours), 0);

  return (
    <>
      <PageHeader
        title="Time Entries"
        meta={`${rows.length} entries · ${totalHours.toFixed(2)} hrs`}
        actions={
          <ButtonLink variant="primary" href="/time/new">
            + Log time
          </ButtonLink>
        }
      />

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
            placeholder="Description"
            defaultValue={q}
          />
          <SelectField label="User" name="user" defaultValue={userId}>
            <option value="">All</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </SelectField>
          <SelectField label="Client" name="client" defaultValue={clientId}>
            <option value="">All</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Billable" name="billable" defaultValue={billable}>
            <option value="">All</option>
            <option value="yes">Billable</option>
            <option value="no">Non-billable</option>
          </SelectField>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/time">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 my-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div
          className="rounded-lg p-3.5"
          style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
        >
          <div className="uppercase" style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}>
            Total hours
          </div>
          <div className="mt-1" style={{ fontSize: 22, color: "var(--ink)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
            {totalHours.toFixed(2)}
          </div>
        </div>
        <div
          className="rounded-lg p-3.5"
          style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
        >
          <div className="uppercase" style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}>
            Billable hours
          </div>
          <div className="mt-1" style={{ fontSize: 22, color: "var(--ink)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
            {billableHours.toFixed(2)}
          </div>
        </div>
        <div
          className="rounded-lg p-3.5"
          style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
        >
          <div className="uppercase" style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}>
            Billable value
          </div>
          <div className="mt-1" style={{ fontSize: 22, color: "var(--ink)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
            {formatUSD(billableValue, { paren: true })}
          </div>
        </div>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Time entries">
          {rows.length === 0 ? (
            <Empty
              title="No time entries match"
              body="Log time from /time/new or clear filters."
              cta={
                <ButtonLink variant="primary" href="/time/new">
                  + Log time
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>User</TH>
                  <TH>Client / Entity</TH>
                  <TH>Description</TH>
                  <TH>Task</TH>
                  <TH num>Hours</TH>
                  <TH num>Rate</TH>
                  <TH num>Amount</TH>
                  <TH>Billable</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((t) => {
                  const u = userById.get(t.userId);
                  const c = t.clientId ? customerById.get(t.clientId) : undefined;
                  const e = t.entityId ? entityById.get(t.entityId) : undefined;
                  const hrs = parseAmount(t.durationHours);
                  const rate = t.rateAtLog ? parseAmount(t.rateAtLog) : 0;
                  return (
                    <TR key={t.id} href={`/time/${t.id}`}>
                      <TD>{formatDate(t.entryDate)}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>{u?.fullName ?? "—"}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {c?.name ?? "—"}
                        {e ? ` · ${e.code}` : ""}
                      </TD>
                      <TD>
                        <Link
                          href={`/time/${t.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {t.description}
                        </Link>
                      </TD>
                      <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                        {t.taskType ?? "—"}
                      </TD>
                      <TD num>{hrs.toFixed(2)}</TD>
                      <TD num style={{ color: "var(--ink-3)" }}>
                        {t.rateAtLog ? formatUSD(rate, { paren: true }) : "—"}
                      </TD>
                      <TD num>
                        {t.isBillable && t.rateAtLog
                          ? formatUSD(hrs * rate, { paren: true })
                          : "—"}
                      </TD>
                      <TD>
                        <Pill variant={t.isBillable ? "active" : "neutral"}>
                          {t.isBillable ? "Billable" : "Internal"}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD colSpan={5}>Totals</TD>
                  <TD num>{totalHours.toFixed(2)}</TD>
                  <TD num>{""}</TD>
                  <TD num>{formatUSD(billableValue, { paren: true })}</TD>
                  <TD>{""}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
