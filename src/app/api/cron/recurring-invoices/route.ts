import { NextResponse } from "next/server";

import { generateDueRecurringInvoices } from "@/lib/mutations";
import { getUserById } from "@/lib/data";

/**
 * POST /api/cron/recurring-invoices
 *
 * Generates a draft invoice for every recurring template whose
 * `recurringNextDate` is on or before today (and not past its
 * `recurringEndDate`). Each generated invoice advances the template's
 * `recurringNextDate` by one frequency step.
 *
 * Designed to be called by a Vercel Cron Job:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/recurring-invoices", "schedule": "0 7 * * *" }
 *     ]
 *   }
 *
 * Auth: Vercel cron requests carry an Authorization header of
 * `Bearer ${CRON_SECRET}`. We require it in production. GET is also
 * accepted so the route can be triggered by hand from a browser when
 * CRON_SECRET isn't set (local dev / smoke tests).
 */
async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Attribute generated invoices to the "system" user — falls back to
  // u-admin which is seeded in every environment.
  const adminUser = (await getUserById("u-admin")) ?? null;
  const sessionUser = adminUser
    ? {
        userId: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        role: adminUser.role,
        isSuperuser: adminUser.isSuperuser,
      }
    : {
        userId: "u-admin",
        email: "system@thistlewood.local",
        fullName: "Recurring Cron",
        role: "Admin",
        isSuperuser: true,
      };

  const today = new Date().toISOString().slice(0, 10);
  const result = await generateDueRecurringInvoices(sessionUser, today);
  return NextResponse.json({
    today,
    generated: result.generated,
    skipped: result.skipped,
    errors: result.errors,
  });
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
