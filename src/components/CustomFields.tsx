import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { CustomFieldSelect } from "@/components/CustomFieldSelect";
import {
  getCustomFieldDefinitions,
  getCustomFieldValuesForRecord,
} from "@/lib/data";
import { saveCustomFieldsAction } from "./CustomFieldsActions";
import type { CustomFieldRecordType } from "@/lib/types";

/**
 * Generic admin-defined custom-fields card. Drops into any detail page —
 * pass the record type and record id, and the card auto-loads active
 * field definitions + the record's current values, and renders one input
 * per definition. Saving POSTs every field at once via
 * `saveCustomFieldsAction`, which upserts into `custom_field_values`.
 */
export async function CustomFields({
  recordType,
  recordId,
  redirectPath,
}: {
  recordType: CustomFieldRecordType;
  recordId: string;
  redirectPath: string;
}) {
  const [defs, values] = await Promise.all([
    getCustomFieldDefinitions(recordType),
    getCustomFieldValuesForRecord(recordId),
  ]);
  const active = defs.filter((d) => d.isActive);
  if (active.length === 0) return null;
  const byDef = new Map(values.map((v) => [v.definitionId, v] as const));

  return (
    <form action={saveCustomFieldsAction}>
      <input type="hidden" name="recordType" value={recordType} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="redirectPath" value={redirectPath} />
      <input
        type="hidden"
        name="definitionIds"
        value={active.map((d) => d.id).join(",")}
      />
      <Card
        title="Custom fields"
        actions={
          <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
            Defined in Settings → Custom Fields
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {active.map((d) => {
            const v = byDef.get(d.id);
            const name = `cf_${d.id}`;
            if (d.fieldType === "boolean") {
              return (
                <label key={d.id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    name={name}
                    defaultChecked={!!v?.valueBoolean}
                  />
                  <span style={{ color: "var(--ink-2)" }}>{d.label}</span>
                  {d.helpText && (
                    <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
                      · {d.helpText}
                    </span>
                  )}
                </label>
              );
            }
            if (d.fieldType === "select" && d.options) {
              return (
                <div key={d.id} className="flex flex-col gap-1">
                  <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {d.label}
                    {d.helpText ? ` — ${d.helpText}` : ""}
                  </span>
                  <CustomFieldSelect
                    name={name}
                    defaultValue={v?.valueText ?? ""}
                    options={d.options}
                  />
                </div>
              );
            }
            const inputType =
              d.fieldType === "date"
                ? "date"
                : d.fieldType === "number"
                  ? "number"
                  : "text";
            const defaultValue =
              d.fieldType === "date"
                ? (v?.valueDate ?? "")
                : d.fieldType === "number"
                  ? (v?.valueNumber ?? "")
                  : (v?.valueText ?? "");
            return (
              <Field
                key={d.id}
                label={d.helpText ? `${d.label} — ${d.helpText}` : d.label}
                name={name}
                type={inputType}
                inputMode={d.fieldType === "number" ? "decimal" : undefined}
                defaultValue={defaultValue}
                mono={d.fieldType === "number"}
              />
            );
          })}
          <div className="flex justify-end">
            <Button variant="primary" type="submit">
              Save custom fields
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
