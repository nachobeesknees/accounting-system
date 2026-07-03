"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "@/lib/session";
import { PermissionError } from "@/lib/permissions";
import { upsertVarianceNote } from "@/lib/mutations";
import { getTopJournalLinesByAccount, getVarianceNotes } from "@/lib/data";
import {
  computeVariance,
  materialRows,
  type VarianceCompare,
  type VarianceMode,
} from "@/lib/variance";

const MODEL = "claude-haiku-4-5-20251001";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function parseKey(formData: FormData): {
  fiscalYear: number;
  month: number;
  mode: VarianceMode;
  compare: VarianceCompare;
} | null {
  const fiscalYear = parseInt(String(formData.get("fiscalYear") ?? ""), 10);
  const month = parseInt(String(formData.get("month") ?? ""), 10);
  const modeRaw = String(formData.get("mode") ?? "");
  const compareRaw = String(formData.get("compare") ?? "");
  if (!Number.isInteger(fiscalYear) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  if (modeRaw !== "monthly" && modeRaw !== "ytd") return null;
  if (compareRaw !== "budget" && compareRaw !== "prior_year") return null;
  return { fiscalYear, month, mode: modeRaw, compare: compareRaw };
}

function backUrl(
  key: { fiscalYear: number; month: number; mode: string; compare: string },
  extra?: string,
): string {
  return `/reports/variance?year=${key.fiscalYear}&month=${key.month}&mode=${key.mode}&compare=${key.compare}${extra ?? ""}`;
}

/** Accountant saves / customizes one explanation. */
export async function saveVarianceNoteAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const key = parseKey(formData);
  if (!key) redirect("/reports/variance");
  const accountId = String(formData.get("accountId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!accountId || note === "") redirect(backUrl(key));

  try {
    await upsertVarianceNote(user, { ...key, accountId }, note, "user");
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg =
      err instanceof PermissionError
        ? "You don't have permission to edit variance notes."
        : err instanceof Error
          ? err.message
          : "Save failed";
    redirect(backUrl(key, `&error=${encodeURIComponent(msg)}`));
  }
  revalidatePath("/reports/variance");
  redirect(backUrl(key, "&saved=1"));
}

/**
 * Generate AI explanations for every material variance in the report.
 * Existing accountant edits (source='user') are never overwritten.
 */
export async function generateVarianceExplanationsAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const key = parseKey(formData);
  if (!key) redirect("/reports/variance");

  if (!process.env.ANTHROPIC_API_KEY) {
    redirect(
      backUrl(key, `&error=${encodeURIComponent("ANTHROPIC_API_KEY is not configured.")}`),
    );
  }

  try {
    const report = await computeVariance(key.fiscalYear, key.month, key.mode, key.compare);
    const existing = await getVarianceNotes(key.fiscalYear, key.month, key.mode, key.compare);
    // Explain material variances that aren't accountant-owned yet. Cap the
    // batch so the prompt stays small.
    const targets = materialRows(report.rows)
      .filter((r) => existing.get(r.accountId)?.source !== "user")
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 25);
    if (targets.length === 0) {
      redirect(backUrl(key, "&generated=0"));
    }

    const grounding = await getTopJournalLinesByAccount(
      targets.map((t) => t.accountId),
      report.period.start,
      report.period.end,
    );

    const lines = targets.map((t) => {
      const drivers = (grounding.get(t.accountId) ?? [])
        .map((g) => `${g.date} "${g.description}" ${g.amount.toFixed(2)}`)
        .join("; ");
      return {
        accountId: t.accountId,
        account: `${t.code} — ${t.name} (${t.accountType})`,
        actual: Math.round(t.actual * 100) / 100,
        comparison: Math.round(t.comparison * 100) / 100,
        variance: Math.round(t.variance * 100) / 100,
        variancePct: t.variancePct !== null ? Math.round(t.variancePct * 1000) / 10 : null,
        favorable: t.favorable,
        largestPostings: drivers || "(none)",
      };
    });

    const prompt = `You are an accountant writing variance commentary for a management P&L.

Period: ${report.period.label}. Comparison basis: ${report.compareLabel}. Amounts in USD.

For each account below, write ONE concise explanation (max 2 sentences) of why actuals differ from the comparison. Ground it in the largest postings when they're informative; otherwise describe the pattern (volume, timing, rate, new/discontinued activity). State favorable/unfavorable direction naturally, don't repeat the raw numbers verbatim.

Accounts:
${JSON.stringify(lines, null, 2)}

Respond with ONLY a JSON array: [{"accountId": "...", "explanation": "..."}] — one entry per account, no other text.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text.");
    }
    const jsonStart = textBlock.text.indexOf("[");
    const jsonEnd = textBlock.text.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("Could not parse model response.");
    }
    const parsed = JSON.parse(textBlock.text.slice(jsonStart, jsonEnd + 1)) as Array<{
      accountId?: string;
      explanation?: string;
    }>;

    const validIds = new Set(targets.map((t) => t.accountId));
    let written = 0;
    for (const p of parsed) {
      if (!p.accountId || !validIds.has(p.accountId)) continue;
      const note = (p.explanation ?? "").trim();
      if (!note) continue;
      await upsertVarianceNote(user, { ...key, accountId: p.accountId }, note, "ai", {
        preserveUserEdits: true,
      });
      written++;
    }
    revalidatePath("/reports/variance");
    redirect(backUrl(key, `&generated=${written}`));
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg =
      err instanceof PermissionError
        ? "You don't have permission to generate variance notes."
        : err instanceof Error
          ? err.message
          : "Generation failed";
    redirect(backUrl(key, `&error=${encodeURIComponent(msg)}`));
  }
}
