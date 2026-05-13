import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { SelectField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAssetsByClientId,
  getCustomerAssignments,
  getCustomerById,
  getEntitiesByClientId,
  getInvoices,
  getUserById,
  getUsers,
} from "@/lib/data";
import type { Customer } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import {
  addAssignmentAction,
  removeAssignmentAction,
  setAssignedUserAction,
} from "./actions";

// Local accessor: surface the `assignedUserId` column even if the shared
// `Customer` type and `data.ts` mapper haven't yet been extended with the
// new approval-workflow field. Falls back to `null` at runtime when absent.
type CustomerWithAssignment = Customer & { assignedUserId?: string | null };
function readAssignedUserId(c: Customer): string | null {
  const v = (c as CustomerWithAssignment).assignedUserId;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const assignedUserId = readAssignedUserId(customer);

  const [allInvoices, entities, directAssets, users, assignedUser, assignments] =
    await Promise.all([
      getInvoices(),
      getEntitiesByClientId(customer.id),
      getAssetsByClientId(customer.id),
      getUsers(),
      assignedUserId ? getUserById(assignedUserId) : Promise.resolve(undefined),
      getCustomerAssignments(customer.id),
    ]);
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const assignedUserIds = new Set(assignments.map((a) => a.userId));
  const customerInvoices = allInvoices
    .filter((inv) => inv.customerId === customer.id)
    .slice()
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  const totalInvoiced = customerInvoices.reduce(
    (s, inv) => s + parseAmount(inv.total),
    0,
  );
  const totalPaid = customerInvoices.reduce(
    (s, inv) => s + parseAmount(inv.amountPaid),
    0,
  );
  const outstanding = customerInvoices.reduce(
    (s, inv) => s + parseAmount(inv.balanceDue),
    0,
  );
  const lastInvoiceDate = customerInvoices[0]?.invoiceDate ?? null;

  const billingLines = (customer.billingAddress ?? "").split(/,\s*/);

  return (
    <>
      <PageHeader
        title={customer.name}
        meta={customer.code}
        actions={
          <ButtonLink variant="secondary" href="/customers">
            ← All clients
          </ButtonLink>
        }
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5">
        {sp.saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Assignment saved.
          </div>
        )}
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 px-6 my-3.5">
        <Card title="Contact">
          <KVGrid>
            <KV k="Code" v={customer.code} mono />
            <KV k="Email" v={customer.email ?? "—"} />
            <KV k="Phone" v={customer.phone ?? "—"} mono />
            <KV
              k="Billing address"
              v={
                customer.billingAddress ? (
                  <div className="flex flex-col">
                    {billingLines.map((line, idx) => (
                      <span key={idx}>{line}</span>
                    ))}
                  </div>
                ) : (
                  "—"
                )
              }
            />
            <KV k="Payment terms" v={`Net ${customer.paymentTerms}`} />
          </KVGrid>
        </Card>

        <Card title="Balance summary">
          <KVGrid>
            <KV
              k="Total invoiced"
              v={formatUSD(totalInvoiced, { paren: true })}
              mono
            />
            <KV
              k="Total paid"
              v={formatUSD(totalPaid, { paren: true })}
              mono
            />
            <KV
              k="Outstanding balance"
              v={formatUSD(outstanding, { paren: true })}
              mono
            />
            <KV
              k="Last invoice date"
              v={lastInvoiceDate ? formatDate(lastInvoiceDate) : "—"}
            />
          </KVGrid>
        </Card>
      </div>

      <div className="px-6 mb-3.5">
        <Card title="Assigned employees">
          <div className="p-3.5 flex flex-col gap-3">
            {assignments.length === 0 && !assignedUser ? (
              <div
                className="text-[12.5px]"
                style={{ color: "var(--ink-3)" }}
              >
                No employees assigned yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => {
                  const u = userById.get(a.userId);
                  return (
                    <div
                      key={a.id}
                      className="inline-flex items-center gap-2 rounded-md pl-3 pr-1 py-1"
                      style={{
                        background: a.isPrimary
                          ? "var(--p-formation-bg)"
                          : "var(--rail)",
                        border: "1px solid var(--line)",
                        fontSize: 12.5,
                      }}
                    >
                      <span style={{ color: "var(--ink)" }}>
                        {u?.fullName ?? a.userId}
                      </span>
                      <Pill variant="neutral">{u?.role ?? "—"}</Pill>
                      {a.isPrimary && <Pill variant="formation">primary</Pill>}
                      {!a.canApprove && (
                        <Pill variant="review">view only</Pill>
                      )}
                      <form action={removeAssignmentAction}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <button
                          type="submit"
                          aria-label="Remove"
                          className="rounded-md px-2 py-0.5 cursor-pointer"
                          style={{
                            color: "var(--ink-3)",
                            background: "transparent",
                            fontSize: 14,
                            lineHeight: 1,
                            border: "none",
                          }}
                          title="Remove this assignment"
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addAssignmentAction} className="flex items-end gap-3 flex-wrap">
              <input type="hidden" name="customerId" value={customer.id} />
              <div className="flex-1 min-w-[240px] max-w-md">
                <SelectField
                  label="Assign another employee"
                  name="userId"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Pick a user…
                  </option>
                  {users
                    .filter((u) => !assignedUserIds.has(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} · {u.role}
                      </option>
                    ))}
                </SelectField>
              </div>
              <label
                className="flex items-center gap-1.5 text-[12.5px] cursor-pointer mb-1"
                style={{ color: "var(--ink-2)" }}
              >
                <input type="checkbox" name="canApprove" value="1" defaultChecked />
                Can approve invoices
              </label>
              <label
                className="flex items-center gap-1.5 text-[12.5px] cursor-pointer mb-1"
                style={{ color: "var(--ink-2)" }}
              >
                <input type="checkbox" name="isPrimary" value="1" />
                Mark as primary
              </label>
              <Button type="submit" variant="primary">
                + Add
              </Button>
            </form>
          </div>
        </Card>
      </div>

      {directAssets.length > 0 && (
        <div className="px-6 mb-3.5">
          <Card
            title="Direct holdings (no entity wrapper)"
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                {directAssets.length} asset{directAssets.length === 1 ? "" : "s"} held
                directly by client
              </span>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Asset</TH>
                  <TH>Class</TH>
                  <TH>External ref</TH>
                </TR>
              </THead>
              <TBody>
                {directAssets.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link
                        href={`/aua/${a.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {a.name}
                      </Link>
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {a.kind}
                    </TD>
                    <TD mono style={{ color: "var(--ink-3)" }}>
                      {a.externalRef ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      <div className="px-6 mb-3.5">
        <Card
          title="Entities"
          actions={
            <ButtonLink variant="ghost" href={`/entities/new?client=${customer.id}`}>
              + New entity
            </ButtonLink>
          }
        >
          {entities.length === 0 ? (
            <Empty
              title="No entities yet"
              body="Track LLCs, trusts, or other vehicles this client owns."
              cta={
                <ButtonLink
                  variant="primary"
                  href={`/entities/new?client=${customer.id}`}
                >
                  + New entity
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Kind</TH>
                  <TH>Jurisdiction</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {entities.map((e) => (
                  <TR key={e.id}>
                    <TD mono>
                      <Link
                        href={`/entities/${e.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {e.code}
                      </Link>
                    </TD>
                    <TD>{e.name}</TD>
                    <TD
                      style={{
                        color: "var(--ink-3)",
                        fontSize: 11.5,
                        textTransform: "uppercase",
                      }}
                    >
                      {e.kind}
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      {e.jurisdiction ?? "—"}
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(e.status)}>
                        {statusLabel(e.status)}
                      </Pill>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="px-6 mb-8">
        <Card title="Invoices">
          {customerInvoices.length === 0 ? (
            <Empty
              title="No invoices yet"
              body="This customer has no invoices on record."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Invoice #</TH>
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH num>Total</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {customerInvoices.map((inv) => {
                  const bal = parseAmount(inv.balanceDue);
                  const isOverdue = inv.status === "overdue" && bal > 0;
                  return (
                    <TR key={inv.id}>
                      <TD mono>
                        <Link
                          href={`/invoices/${inv.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </TD>
                      <TD>{formatDate(inv.invoiceDate)}</TD>
                      <TD>{formatDate(inv.dueDate)}</TD>
                      <TD num>{formatUSD(inv.total, { paren: true })}</TD>
                      <TD num neg={isOverdue}>
                        {formatUSD(bal, { paren: true })}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(inv.status)}>
                          {statusLabel(inv.status)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
