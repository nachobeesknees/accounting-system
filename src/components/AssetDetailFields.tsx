"use client";

/**
 * Dynamic form inputs for kind-specific asset fields, driven by the
 * catalogs in src/lib/asset-fields.ts. Values submit as `details[<key>]`
 * and persist into assets.details (jsonb).
 */

import { Field, Row } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ASSET_KIND_FIELDS, type AssetFieldDef } from "@/lib/asset-fields";
import type { AssetKind } from "@/lib/types";

export function AssetDetailField({
  def,
  defaultValue,
}: {
  def: AssetFieldDef;
  defaultValue?: string;
}) {
  if (def.type === "money") {
    return (
      <MoneyInput
        label={def.label}
        name={`details[${def.key}]`}
        placeholder={def.placeholder ?? "0.00"}
        defaultValue={defaultValue ?? ""}
      />
    );
  }
  return (
    <Field
      label={def.label}
      name={`details[${def.key}]`}
      type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
      mono={def.mono}
      placeholder={def.placeholder}
      help={def.help}
      defaultValue={defaultValue ?? ""}
    />
  );
}

/** Catalog fields laid out two-up, matching the app's Row pattern. */
export function AssetDetailRows({
  kind,
  details = {},
}: {
  kind: AssetKind;
  details?: Record<string, string>;
}) {
  const defs = ASSET_KIND_FIELDS[kind];
  if (!defs.length) return null;
  const rows: AssetFieldDef[][] = [];
  for (let i = 0; i < defs.length; i += 2) rows.push(defs.slice(i, i + 2));
  return (
    <>
      {rows.map((pair) => (
        <Row key={pair[0].key}>
          <AssetDetailField def={pair[0]} defaultValue={details[pair[0].key]} />
          {pair[1] ? (
            <AssetDetailField def={pair[1]} defaultValue={details[pair[1].key]} />
          ) : (
            <div />
          )}
        </Row>
      ))}
    </>
  );
}
