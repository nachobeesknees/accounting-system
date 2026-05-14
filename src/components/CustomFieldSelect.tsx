"use client";

import { SmartSelect } from "@/components/ui/SmartSelect";

export function CustomFieldSelect({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <SmartSelect
      name={name}
      defaultValue={defaultValue}
      options={[
        { value: "", label: "—" },
        ...options.map((o) => ({ value: o, label: o })),
      ]}
      emptyLabel="—"
      clearable
      triggerStyle={{
        background: "var(--paper)",
        border: "1px solid var(--line-2)",
        color: "var(--ink)",
        borderRadius: 6,
        padding: "5px 28px 5px 8px",
        fontSize: 13,
        minHeight: 30,
      }}
    />
  );
}
