"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { SmartSelectField } from "@/components/ui/SmartSelect";
import { AssetDetailRows } from "@/components/AssetDetailFields";
import {
  ASSET_KIND_FIELDS,
  ASSET_KIND_LABEL,
  ASSET_KINDS,
} from "@/lib/asset-fields";
import { maskAccountNumber } from "@/lib/format";
import { createAssetAction, type CreateAssetState } from "./actions";
import type { Account, AssetKind, BankAccount, Customer, Entity } from "@/lib/types";

const initial: CreateAssetState = { error: null };

export function NewAssetForm({
  entities,
  customers,
  bankAccounts,
  glAccounts,
  defaultEntityId,
}: {
  entities: Entity[];
  customers: Customer[];
  bankAccounts: BankAccount[];
  glAccounts: Account[];
  defaultEntityId?: string;
}) {
  const [state, action] = useActionState(createAssetAction, initial);
  const [kind, setKind] = useState<AssetKind>("real_estate");
  // bank_account kind: link an existing bank account or create one inline.
  const [bankMode, setBankMode] = useState<"existing" | "new">("existing");
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const cashGlAccounts = glAccounts.filter(
    (a) => a.accountType === "asset" && a.code.startsWith("1"),
  );
  // When the user arrived from an entity page (?entity=...), the entity is
  // mandatory and locked — assets are entity-scoped. Without that param the
  // selector is shown but still required.
  const fromEntity = !!defaultEntityId;
  const lockedEntity = fromEntity
    ? entities.find((e) => e.id === defaultEntityId)
    : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action}>
      <div className="px-6 my-3.5 flex flex-col gap-3.5">
        {state.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {state.error}
          </div>
        )}

        {fromEntity && lockedEntity && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Creating asset inside entity{" "}
            <strong>
              {lockedEntity.code} — {lockedEntity.name}
            </strong>
            .
          </div>
        )}

        <Card title="Asset details">
          <div className="flex flex-col gap-3">
            <Row>
              <Field
                label="Name"
                name="name"
                required
                placeholder="401 Pine Tower (Seattle)"
              />
              <SelectField
                label="Kind"
                name="kind"
                required
                value={kind}
                onChange={(e) => setKind(e.target.value as AssetKind)}
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABEL[k]}
                  </option>
                ))}
              </SelectField>
            </Row>
            <Row>
              {fromEntity && lockedEntity ? (
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[11.5px]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    Entity
                  </span>
                  <div
                    className="px-2.5 py-1.5 text-[13px] rounded-md"
                    style={{
                      background: "var(--raised)",
                      border: "1px solid var(--line-2)",
                      color: "var(--ink-2)",
                    }}
                  >
                    {lockedEntity.code} — {lockedEntity.name}
                  </div>
                  <input
                    type="hidden"
                    name="entityId"
                    value={lockedEntity.id}
                  />
                </div>
              ) : (
                <SmartSelectField
                  label="Entity"
                  name="entityId"
                  required
                  defaultValue=""
                  options={entities.map((e) => {
                    const c = customerById.get(e.clientId);
                    return {
                      value: e.id,
                      label: `${e.code} — ${e.name}${c ? ` (${c.name})` : ""}`,
                      search: e.code,
                    };
                  })}
                  emptyLabel="Select entity…"
                />
              )}
              <Field
                label="Valuation date"
                name="valuationDate"
                type="date"
                defaultValue={today}
                help="The date this asset's current carrying value is as-of. Drives the AUA report."
              />
            </Row>
            <Row>
              <Field
                label="Currency"
                name="currencyCode"
                mono
                defaultValue="USD"
                maxLength={3}
              />
              <Field
                label="External reference"
                name="externalRef"
                placeholder="Account or parcel ID"
                mono
              />
            </Row>
            <Row>
              <Field label="Acquired date" name="acquiredDate" type="date" />
              <div />
            </Row>
            <TextareaField label="Notes" name="notes" placeholder="Optional notes" />
          </div>
        </Card>

        {ASSET_KIND_FIELDS[kind].length > 0 && (
          <Card title={`${ASSET_KIND_LABEL[kind]} details`}>
            <div className="flex flex-col gap-3">
              <AssetDetailRows kind={kind} />
            </div>
          </Card>
        )}

        {kind === "bank_account" && (
          <Card title="Bank account details">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField
                  label="Bank account"
                  value={bankMode}
                  onChange={(e) =>
                    setBankMode(e.target.value as "existing" | "new")
                  }
                >
                  <option value="existing">Link an existing bank account</option>
                  <option value="new">Create a new bank account</option>
                </SelectField>
                <div />
              </Row>
              {bankMode === "existing" ? (
                <Row>
                  <SmartSelectField
                    label="Existing bank account"
                    name="bankAccountId"
                    required
                    options={bankAccounts.map((b) => ({
                      value: b.id,
                      label: `${b.name}${b.institution ? ` · ${b.institution}` : ""} ${maskAccountNumber(b.accountNumber, b.lastFour)}`,
                      search: b.lastFour ?? "",
                    }))}
                    emptyLabel="Select bank account…"
                    help="Signers, routing, and the account number live on the bank account record."
                  />
                  <div />
                </Row>
              ) : (
                <>
                  <Row>
                    <Field
                      label="Institution"
                      name="bankNew[institution]"
                      placeholder="JPMorgan Private Bank"
                    />
                    <SmartSelectField
                      label="GL account"
                      name="bankNew[accountId]"
                      required
                      options={cashGlAccounts.map((a) => ({
                        value: a.id,
                        label: `${a.code} — ${a.name}`,
                        search: a.code,
                      }))}
                      emptyLabel="Select GL account…"
                    />
                  </Row>
                  <Row>
                    <Field
                      label="ABA routing number"
                      name="bankNew[routingNumber]"
                      mono
                      maxLength={9}
                      placeholder="021000021"
                    />
                    <Field
                      label="Account number"
                      name="bankNew[accountNumber]"
                      mono
                      placeholder="Full account number"
                      help="Stored in full; always displayed masked (····1234). Add signers on the bank account page after creating."
                    />
                  </Row>
                </>
              )}
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Link
            href={
              fromEntity && lockedEntity
                ? `/entities/${lockedEntity.id}`
                : "/entities"
            }
            className="px-3 py-1.5 text-[13px] rounded-md"
            style={{
              border: "1px solid var(--line-2)",
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
          <Button variant="primary" type="submit">
            Create asset
          </Button>
        </div>
      </div>
    </form>
  );
}
