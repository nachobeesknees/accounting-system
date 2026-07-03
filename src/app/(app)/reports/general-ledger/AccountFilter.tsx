"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SmartSelect } from "@/components/ui/SmartSelect";

/** Account narrowing control for the General Ledger report. */
export function AccountFilter({
  accounts,
  current,
}: {
  accounts: Array<{ id: string; code: string; name: string }>;
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <SmartSelect
      value={current}
      onChange={(v) => {
        const next = new URLSearchParams(params.toString());
        if (v) next.set("account", v);
        else next.delete("account");
        startTransition(() => router.push(`/reports/general-ledger?${next.toString()}`));
      }}
      options={accounts.map((a) => ({
        value: a.id,
        label: `${a.code} — ${a.name}`,
        search: a.code,
      }))}
      emptyLabel="All accounts"
      clearable
      ariaLabel="Filter by account"
    />
  );
}
