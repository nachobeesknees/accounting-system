import { redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, TextareaField } from "@/components/ui/Field";
import { SmartSelectField, type SmartSelectOption } from "@/components/ui/SmartSelect";
import {
  getBankAccounts,
  getBeneficiaryContacts,
  getCurrencies,
  getEntities,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { maskAccountNumber } from "@/lib/format";
import { createDistributionAction } from "../actions";

/**
 * New distribution request. Funding account must be owned by the paying
 * entity (bank_accounts.entity_id) or be a firm (GL-linked) account —
 * validated again server-side in createDistribution. `?entity=<id>`
 * preselects the entity (used from the entity page).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "distribution.create")) redirect("/distributions");

  const [entities, beneficiaries, bankAccounts, currencies] = await Promise.all([
    getEntities(),
    getBeneficiaryContacts(),
    getBankAccounts(),
    getCurrencies(),
  ]);

  const preselect = params.entity ?? "";
  const entityLabelById = new Map(
    entities.map((e) => [e.id, `${e.code} — ${e.name}`] as const),
  );
  const preselectedEntity = entities.find((e) => e.id === preselect);

  // Entity-owned accounts grouped under their entity; true firm accounts
  // (unowned + GL-linked) under "Firm accounts". Other entities' accounts
  // are offered too (grouped by entity) — the server rejects mismatches,
  // regardless of any GL link the account carries.
  const fundingOptions: SmartSelectOption[] = bankAccounts
    .filter(
      (ba) =>
        ba.isActive &&
        (ba.entityId != null || (ba.accountId != null && ba.clientId == null)),
    )
    .map((ba) => ({
      value: ba.id,
      label: `${ba.name} (${maskAccountNumber(ba.accountNumber, ba.lastFour)})`,
      description: `· ${ba.currencyCode}${ba.accountId ? " · GL-linked" : ""}`,
      group: ba.entityId
        ? entityLabelById.get(ba.entityId) ?? "Client entity accounts"
        : "Firm accounts",
      search: ba.institution ?? undefined,
    }))
    .sort((a, b) => {
      const pre = preselectedEntity ? entityLabelById.get(preselectedEntity.id) : null;
      const ga = a.group === pre ? 0 : a.group === "Firm accounts" ? 1 : 2;
      const gb = b.group === pre ? 0 : b.group === "Firm accounts" ? 1 : 2;
      return ga - gb || (a.group ?? "").localeCompare(b.group ?? "");
    });

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Distributions", href: "/distributions" },
          { label: "New distribution" },
        ]}
      />
      <PageHeader
        title="New distribution"
        meta="Beneficiary payout — requires two approvals before payment"
        actions={
          <ButtonLink variant="secondary" href="/distributions">
            ← All distributions
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

        {beneficiaries.length === 0 && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-pending-bg)",
              color: "var(--p-pending-fg)",
              border: "1px solid var(--p-pending-fg)",
            }}
          >
            No contacts are tagged as beneficiaries yet. Flag the recipient on
            their contact page (Contacts → tags → Beneficiary) first.
          </div>
        )}

        <form action={createDistributionAction}>
          <Card title="Distribution request">
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
                  }))}
                  emptyLabel="Pick an entity…"
                />
                <SmartSelectField
                  label="Beneficiary"
                  name="beneficiaryContactId"
                  required
                  options={beneficiaries.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.email ? `· ${c.email}` : undefined,
                    search: c.code,
                  }))}
                  emptyLabel="Pick a beneficiary…"
                />
              </Row>
              <Row>
                <Field
                  label="Amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  mono
                  placeholder="0.00"
                />
                <SmartSelectField
                  label="Currency"
                  name="currencyCode"
                  defaultValue={preselectedEntity?.currencyCode ?? "USD"}
                  options={currencies
                    .filter((c) => c.isActive)
                    .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                />
              </Row>
              <Row>
                <SmartSelectField
                  label="Funding bank account"
                  name="bankAccountId"
                  options={fundingOptions}
                  emptyLabel="— None recorded —"
                  clearable
                />
                <Field
                  label="Resolution reference"
                  name="resolutionReference"
                  mono
                  placeholder="Trustee resolution / minute ref"
                />
              </Row>
              <TextareaField
                label="Notes"
                name="notes"
                placeholder="Purpose, distribution policy reference…"
              />
              <div
                className="rounded-md px-3 py-2 text-[11.5px]"
                style={{
                  background: "var(--rail)",
                  color: "var(--ink-3)",
                  border: "1px solid var(--line)",
                }}
              >
                Paying from a client/entity account (no GL link) records the
                distribution operationally only — client entities never report
                in firm financials. Paying from a GL-linked firm account posts
                a journal entry at payment time.
              </div>
            </div>
          </Card>
          <div className="flex justify-end gap-2 mt-3.5">
            <ButtonLink variant="secondary" href="/distributions">
              Cancel
            </ButtonLink>
            <Button variant="primary" type="submit">
              Request distribution
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
