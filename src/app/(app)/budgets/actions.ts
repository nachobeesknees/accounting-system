"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { setMonthlyBudgets, type BudgetCell } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function saveBudgetsAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const fiscalYear = parseInt(String(formData.get("fiscalYear") ?? ""), 10);
  if (!Number.isInteger(fiscalYear)) redirect("/budgets");

  // Cell inputs are named b[<accountId>][<month>]. The grid submits every
  // cell; blanks clear that cell's budget.
  const cells: BudgetCell[] = [];
  for (const [name, value] of formData.entries()) {
    const m = name.match(/^b\[([^\]]+)\]\[(\d{1,2})\]$/);
    if (!m || typeof value !== "string") continue;
    const month = parseInt(m[2], 10);
    const trimmed = value.trim();
    cells.push({
      accountId: m[1],
      month,
      amount: trimmed === "" ? null : parseAmount(trimmed),
    });
  }

  try {
    await setMonthlyBudgets(user, fiscalYear, cells);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Save failed";
    redirect(`/budgets?year=${fiscalYear}&error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/budgets");
  revalidatePath("/reports");
  redirect(`/budgets?year=${fiscalYear}&saved=1`);
}
