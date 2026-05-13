"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createCurrency,
  createFxRate,
  deleteCurrency,
  deleteFxRate,
  setBaseCurrency,
  setCurrencyActive,
} from "@/lib/mutations";
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

export async function addCurrencyAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "").trim();
  const symbol = String(formData.get("symbol") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const decimalsStr = String(formData.get("decimals") ?? "2").trim();
  const isBase = formData.get("isBase") === "on";

  if (!code || !symbol || !name) {
    redirect("/currencies?error=" + encodeURIComponent("Code, symbol and name required."));
  }
  try {
    await createCurrency(user, {
      code,
      symbol,
      name,
      decimals: parseInt(decimalsStr, 10) || 2,
      isBase,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Add failed";
    redirect("/currencies?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/currencies");
  revalidatePath("/aua");
  redirect("/currencies?saved=1");
}

export async function setBaseCurrencyAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "").trim();
  if (!code) redirect("/currencies");
  try {
    await setBaseCurrency(user, code);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Set base failed";
    redirect("/currencies?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/currencies");
  revalidatePath("/settings");
  revalidatePath("/aua");
  redirect("/currencies?saved=1");
}

export async function toggleActiveAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "");
  const next = formData.get("active") !== "on";
  try {
    await setCurrencyActive(user, code, next);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/currencies");
  redirect("/currencies");
}

export async function deleteCurrencyAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "");
  try {
    await deleteCurrency(user, code);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect("/currencies?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/currencies");
  redirect("/currencies");
}

export async function addFxRateAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const currencyCode = String(formData.get("currencyCode") ?? "").trim();
  const rateDate = String(formData.get("rateDate") ?? "").trim();
  const ratePerBase = parseAmount(String(formData.get("ratePerBase") ?? ""));
  const source = String(formData.get("source") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!currencyCode || !rateDate || !Number.isFinite(ratePerBase) || ratePerBase <= 0) {
    redirect("/currencies?error=" + encodeURIComponent("Currency, date and positive rate required."));
  }
  try {
    await createFxRate(user, {
      currencyCode,
      rateDate,
      ratePerBase,
      source: source || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Add rate failed";
    redirect("/currencies?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/currencies");
  revalidatePath("/aua");
  redirect("/currencies?saved=1");
}

export async function deleteFxRateAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/currencies");
  try {
    await deleteFxRate(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/currencies");
  revalidatePath("/aua");
  redirect("/currencies");
}
