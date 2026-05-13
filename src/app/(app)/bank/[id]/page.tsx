import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBankAccountById,
  getCustomers,
  getEntities,
  getSignersByBankAccountId,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD, parseAmount } from "@/lib/money";
import type { SigningAuthority } from "@/lib/types";
import {
  addSignerAction,
  deleteBankAccountAction,
  deleteSignerAction,
  updateBankAccountAction,
} from "./actions";

const AUTHORITY_LABEL: Record<SigningAuthority, string> = {
  sole: "Sole",
  joint: "Joint",
  limited: "Limited",
  view_only: "View only",
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
  const bank = await getBankAccountById(id);
  if (!bank) notFound();

  const [signers, glAccounts, entities, customers] = await Promise.all([
    getSignersByBankAccountId(bank.id),
    getAccounts(),
    getEntities(),
    getCustomers(),
  ]);
  const cashAccounts = glAccounts.filter(
    (a) => a.accountType === "asset" && a.code.startsWith("1"),
  );
  const entity = bank.entityId ? entities.find((e) => e.id === bank.entityId) : undefined;
  const client = bank.clientId
    ? customers.find((c) => c.id === bank.clientId)
    : entity
      ? customers.find((c) => c.id === entity.clientId)
      : undefined;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={bank.name}
        meta={
          bank.institution
            ? `${bank.institution}${bank.lastFour ? ` ····${bank.lastFour}` : ""}`
            : "Bank account"
        }
        actions={
          <>
            <ButtonLink href="/bank" variant="secondary">
              ← All accounts
            </ButtonLink>
            <Pill variant={statusVariant(bank.isActive ? "active" : "inactive")}>
              {statusLabel(bank.isActive ? "active" : "inactive")}
            </Pill>
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
            <form action={updateBankAccountAction}>
              <input type="hidden" name="id" value={bank.id} />
              <Card title="Account details">
                <div className="flex flex-col gap-3">
                  <Row>
                    <Field label="Name" name="name" required defaultValue={bank.name} />
                    <SelectField
                      label="GL account"
                      name="accountId"
                      required
                      defaultValue={bank.accountId}
                    >
                      {cashAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </SelectField>
                  </Row>
                  <Row>
                    <Field
                      label="Institution"
                      name="institution"
                      defaultValue={bank.institution ?? ""}
                    />
                    <Field
                      label="Last 4"
                      name="lastFour"
                      mono
                      maxLength={4}
                      defaultValue={bank.lastFour ?? ""}
                    />
                  </Row>
                  <Row>
                    <Field
                      label="Currency"
                      name="currencyCode"
                      mono
                      maxLength={3}
                      defaultValue={bank.currencyCode}
                    />
                    <Field
                      label="Current balance"
                      name="currentBalance"
                      mono
                      inputMode="decimal"
                      defaultValue={bank.currentBalance ?? ""}
                    />
                  </Row>
                  <Row>
                    <Field
                      label="Balance as-of"
                      name="balanceAsOf"
                      type="date"
                      defaultValue={bank.balanceAsOf ?? ""}
                    />
                    <SelectField
                      label="Entity"
                      name="entityId"
                      defaultValue={bank.entityId ?? ""}
                    >
                      <option value="">Internal / unassigned</option>
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.code} — {e.name}
                        </option>
                      ))}
                    </SelectField>
                  </Row>
                  <Row>
                    <SelectField
                      label="Client"
                      name="clientId"
                      defaultValue={bank.clientId ?? ""}
                    >
                      <option value="">Internal / inherit from entity</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </SelectField>
                    <label className="flex items-end gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={bank.isActive}
                      />
                      <span style={{ color: "var(--ink-2)" }}>Active</span>
                    </label>
                  </Row>
                </div>
                <div className="flex justify-end gap-2 mt-3.5">
                  <Button variant="primary" type="submit">
                    Save changes
                  </Button>
                </div>
              </Card>
            </form>
          </div>

          <Card title="Current balance">
            <div className="flex flex-col gap-1.5 text-[12.5px]">
              <div
                style={{
                  fontSize: 22,
                  color: "var(--ink)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {bank.currentBalance
                  ? formatUSD(parseAmount(bank.currentBalance), { paren: true })
                  : "—"}
              </div>
              <div style={{ color: "var(--ink-3)" }}>
                {bank.balanceAsOf ? `As of ${formatDate(bank.balanceAsOf)}` : "Not set"}
              </div>
              {entity && (
                <div style={{ color: "var(--ink-3)" }}>
                  Entity:{" "}
                  <Link
                    href={`/entities/${entity.id}`}
                    style={{ color: "var(--ink-3)" }}
                  >
                    {entity.name}
                  </Link>
                </div>
              )}
              {client && (
                <div style={{ color: "var(--ink-3)" }}>
                  Client:{" "}
                  <Link
                    href={`/customers/${client.id}`}
                    style={{ color: "var(--ink-3)" }}
                  >
                    {client.name}
                  </Link>
                </div>
              )}
              <div style={{ color: "var(--ink-4)" }}>
                {signers.length} signer{signers.length === 1 ? "" : "s"}
              </div>
            </div>
          </Card>
        </div>

        <Card
          title="Signing authority"
          actions={
            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
              {signers.filter((s) => s.isPrimary).length} primary ·{" "}
              {signers.filter((s) => s.authority === "sole").length} sole
            </span>
          }
        >
          {signers.length === 0 ? (
            <Empty
              title="No signers configured"
              body="Add the people who can sign or transact on this account."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Name</TH>
                  <TH>Title</TH>
                  <TH>Email</TH>
                  <TH>Authority</TH>
                  <TH>Added</TH>
                  <TH>Notes</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {signers.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      {s.name}
                      {s.isPrimary && (
                        <span
                          className="ml-2 text-[10.5px]"
                          style={{
                            color: "var(--p-active-fg)",
                            background: "var(--p-active-bg)",
                            padding: "1px 6px",
                            borderRadius: 4,
                          }}
                        >
                          PRIMARY
                        </span>
                      )}
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>{s.title ?? "—"}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>{s.email ?? "—"}</TD>
                    <TD>
                      <Pill variant={statusVariant(s.authority === "view_only" ? "inactive" : "active")}>
                        {AUTHORITY_LABEL[s.authority]}
                      </Pill>
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      {s.addedDate ? formatDate(s.addedDate) : "—"}
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {s.notes ?? "—"}
                    </TD>
                    <TD>
                      <form action={deleteSignerAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="bankAccountId" value={bank.id} />
                        <Button variant="ghost" type="submit">
                          Remove
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={addSignerAction}>
          <input type="hidden" name="bankAccountId" value={bank.id} />
          <Card title="Add signer">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Name" name="name" required placeholder="Full name" />
                <Field label="Title" name="title" placeholder="Trustee, CFO, etc." />
              </Row>
              <Row>
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                />
                <SelectField label="Authority" name="authority" defaultValue="joint">
                  <option value="sole">Sole</option>
                  <option value="joint">Joint</option>
                  <option value="limited">Limited</option>
                  <option value="view_only">View only</option>
                </SelectField>
              </Row>
              <Row>
                <Field label="Added date" name="addedDate" type="date" defaultValue={today} />
                <label className="flex items-end gap-2 text-[13px]">
                  <input type="checkbox" name="isPrimary" />
                  <span style={{ color: "var(--ink-2)" }}>Primary signer</span>
                </label>
              </Row>
              <TextareaField label="Notes" name="notes" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add signer
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <form action={deleteBankAccountAction}>
          <input type="hidden" name="id" value={bank.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting this bank account removes all signers and unlinks any
                bank transactions referencing it.
              </span>
              <Button variant="danger" type="submit">
                Delete bank account
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
