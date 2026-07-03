import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getCustomers, getEntities, getKycReviews, getUsers } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { getAllowedEntityIds } from "@/lib/entity-access";
import { formatDate } from "@/lib/format";
import {
  KYC_OUTCOME_LABELS,
  KYC_STATUS_LABELS,
  RISK_RATING_LABELS,
  addDaysIso,
  kycStatusVariant,
  riskVariant,
  todayIso,
} from "@/lib/compliance";
import type { KycStatus, RiskRating } from "@/lib/types";

type SubjectRow = {
  type: "customer" | "entity";
  id: string;
  code: string;
  name: string;
  href: string;
  kycStatus: KycStatus;
  riskRating: RiskRating | null;
  pepFlag: boolean;
  nextReviewDate: string | null;
};

function SubjectTable({ rows, showDue = true }: { rows: SubjectRow[]; showDue?: boolean }) {
  const today = todayIso();
  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Code</TH>
          <TH>Name</TH>
          <TH>Type</TH>
          <TH>KYC status</TH>
          <TH>Risk</TH>
          {showDue && <TH>Review due</TH>}
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => {
          const overdue = !!r.nextReviewDate && r.nextReviewDate < today;
          return (
            <TR key={`${r.type}-${r.id}`} href={r.href}>
              <TD mono>
                <Link href={r.href} style={{ color: "var(--ink)", textDecoration: "none" }}>
                  {r.code}
                </Link>
              </TD>
              <TD>{r.name}</TD>
              <TD>
                <Pill variant={r.type === "customer" ? "formation" : "neutral"}>
                  {r.type === "customer" ? "Client" : "Entity"}
                </Pill>
              </TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  {overdue && <Pill variant="review">Overdue</Pill>}
                  <Pill variant={kycStatusVariant(r.kycStatus)}>
                    {KYC_STATUS_LABELS[r.kycStatus]}
                  </Pill>
                </span>
              </TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  <Pill variant={riskVariant(r.riskRating)}>
                    {r.riskRating ? RISK_RATING_LABELS[r.riskRating] : "Unrated"}
                  </Pill>
                  {r.pepFlag && <Pill variant="review">PEP</Pill>}
                </span>
              </TD>
              {showDue && (
                <TD neg={overdue}>
                  {r.nextReviewDate ? formatDate(r.nextReviewDate) : "—"}
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

/**
 * KYC / AML review queue. "Overdue" is derived (next review date in the
 * past, regardless of stored status); "Unverified" catches subjects that
 * never entered the review cycle at all.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [customers, allEntities, allReviews, users, allowedEntityIds] =
    await Promise.all([
      getCustomers(),
      getEntities(),
      getKycReviews(25),
      getUsers(),
      getAllowedEntityIds(user),
    ]);
  // user_entity_access scoping — drop entity subjects (and their review
  // history) outside the user's scope, matching /entities and /journal.
  const entities =
    allowedEntityIds === null
      ? allEntities
      : allEntities.filter((e) => allowedEntityIds.has(e.id));
  const reviews =
    allowedEntityIds === null
      ? allReviews
      : allReviews.filter(
          (r) => r.subjectType !== "entity" || allowedEntityIds.has(r.subjectId),
        );

  const subjects: SubjectRow[] = [
    ...customers.map<SubjectRow>((c) => ({
      type: "customer",
      id: c.id,
      code: c.code,
      name: c.name,
      href: `/customers/${c.id}`,
      kycStatus: c.kycStatus ?? "not_started",
      riskRating: c.riskRating ?? null,
      pepFlag: !!c.pepFlag,
      nextReviewDate: c.kycNextReviewDate ?? null,
    })),
    ...entities.map<SubjectRow>((e) => ({
      type: "entity",
      id: e.id,
      code: e.code,
      name: e.name,
      href: `/entities/${e.id}`,
      kycStatus: e.kycStatus ?? "not_started",
      riskRating: e.riskRating ?? null,
      pepFlag: !!e.pepFlag,
      nextReviewDate: e.kycNextReviewDate ?? null,
    })),
  ];

  const today = todayIso();
  const horizon = addDaysIso(today, 60);
  const byDue = (a: SubjectRow, b: SubjectRow) =>
    (a.nextReviewDate ?? "").localeCompare(b.nextReviewDate ?? "");

  const overdue = subjects
    .filter((s) => !!s.nextReviewDate && s.nextReviewDate < today)
    .sort(byDue);
  const dueSoon = subjects
    .filter(
      (s) => !!s.nextReviewDate && s.nextReviewDate >= today && s.nextReviewDate <= horizon,
    )
    .sort(byDue);
  const unverified = subjects.filter(
    (s) =>
      (s.kycStatus === "not_started" || s.kycStatus === "in_progress") &&
      !s.nextReviewDate,
  );

  const subjectByKey = new Map(subjects.map((s) => [`${s.type}-${s.id}`, s] as const));
  const userNameById = new Map(users.map((u) => [u.id, u.fullName] as const));

  return (
    <>
      <PageHeader
        title="KYC Reviews"
        meta={`${overdue.length} overdue · ${dueSoon.length} due in 60 days · ${unverified.length} unverified`}
      />

      {params.error && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {params.error}
        </div>
      )}
      {params.saved && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-active-bg)",
            color: "var(--p-active-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          Saved.
        </div>
      )}

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <Card
          title="Overdue reviews"
          actions={
            overdue.length > 0 ? (
              <Pill variant="review">{overdue.length} overdue</Pill>
            ) : undefined
          }
        >
          {overdue.length === 0 ? (
            <Empty
              title="Nothing overdue"
              body="No client or entity has a lapsed review date."
            />
          ) : (
            <SubjectTable rows={overdue} />
          )}
        </Card>

        {dueSoon.length > 0 && (
          <Card
            title="Due in 60 days"
            actions={<Pill variant="pending">{dueSoon.length} due</Pill>}
          >
            <SubjectTable rows={dueSoon} />
          </Card>
        )}

        {unverified.length > 0 && (
          <Card
            title="Unverified"
            actions={
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                Not started / in progress with no review scheduled
              </span>
            }
          >
            <SubjectTable rows={unverified} showDue={false} />
          </Card>
        )}

        <Card title="Recent reviews">
          {reviews.length === 0 ? (
            <Empty
              title="No reviews logged yet"
              body="Log reviews from the KYC card on a client or entity page."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Reviewed</TH>
                  <TH>Subject</TH>
                  <TH>Outcome</TH>
                  <TH>Risk after</TH>
                  <TH>Reviewer</TH>
                  <TH>Notes</TH>
                </TR>
              </THead>
              <TBody>
                {reviews.map((r) => {
                  const subject = subjectByKey.get(`${r.subjectType}-${r.subjectId}`);
                  return (
                    <TR key={r.id} href={subject?.href}>
                      <TD>{formatDate(r.reviewDate)}</TD>
                      <TD>
                        {subject ? (
                          <Link
                            href={subject.href}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {subject.code} — {subject.name}
                          </Link>
                        ) : (
                          r.subjectId
                        )}
                      </TD>
                      <TD>
                        <Pill variant={r.outcome === "escalated" ? "review" : "active"}>
                          {KYC_OUTCOME_LABELS[r.outcome]}
                        </Pill>
                      </TD>
                      <TD>
                        {r.riskRatingAfter ? (
                          <Pill variant={riskVariant(r.riskRatingAfter)}>
                            {RISK_RATING_LABELS[r.riskRatingAfter]}
                          </Pill>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {r.reviewerUserId
                          ? userNameById.get(r.reviewerUserId) ?? r.reviewerUserId
                          : "—"}
                      </TD>
                      <TD wrap style={{ color: "var(--ink-3)" }}>
                        {r.notes ?? "—"}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
