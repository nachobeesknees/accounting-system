import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatDate } from "@/lib/format";
import {
  KYC_OUTCOMES,
  KYC_OUTCOME_LABELS,
  KYC_STATUSES,
  KYC_STATUS_LABELS,
  RISK_RATINGS,
  RISK_RATING_LABELS,
  isKycOverdue,
  kycStatusVariant,
  riskVariant,
  todayIso,
} from "@/lib/compliance";
import type {
  KycReview,
  KycStatus,
  KycSubjectType,
  RiskRating,
} from "@/lib/types";
import {
  logKycReviewAction,
  updateKycProfileAction,
} from "@/app/(app)/kyc/actions";

export type KycProfile = {
  kycStatus: KycStatus;
  riskRating: RiskRating | null;
  pepFlag: boolean;
  /** ISO timestamp. */
  sanctionsCheckedAt: string | null;
  /** yyyy-mm-dd. */
  kycNextReviewDate: string | null;
  kycNotes: string | null;
};

/**
 * "KYC / Due diligence" card shared by /customers/[id] and /entities/[id].
 * Shows the derived-Overdue pill, the profile edit form (kyc.write), a
 * log-review form, and the recent review history for the subject.
 */
export function KycCard({
  subjectType,
  subjectId,
  profile,
  reviews,
  userNameById,
  canWrite,
  returnTo,
}: {
  subjectType: KycSubjectType;
  subjectId: string;
  profile: KycProfile;
  reviews: KycReview[];
  userNameById: Map<string, string>;
  canWrite: boolean;
  /** Path the forms land back on (the detail page). */
  returnTo: string;
}) {
  const overdue = isKycOverdue(profile.kycNextReviewDate);
  const recentReviews = reviews.slice(0, 5);

  return (
    <Card
      title="KYC / Due diligence"
      actions={
        <span className="flex items-center gap-1.5 flex-wrap">
          {overdue && <Pill variant="review">Overdue</Pill>}
          <Pill variant={kycStatusVariant(profile.kycStatus)}>
            {KYC_STATUS_LABELS[profile.kycStatus]}
          </Pill>
          <Pill variant={riskVariant(profile.riskRating)}>
            {profile.riskRating
              ? `${RISK_RATING_LABELS[profile.riskRating]} risk`
              : "Unrated"}
          </Pill>
          {profile.pepFlag && <Pill variant="review">PEP</Pill>}
        </span>
      }
    >
      <div className="flex flex-col">
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-2 px-3.5 py-2.5 text-[12.5px]"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
              Sanctions last checked
            </div>
            <div style={{ color: "var(--ink)" }}>
              {profile.sanctionsCheckedAt
                ? formatDate(profile.sanctionsCheckedAt.slice(0, 10))
                : "Never"}
            </div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
              Next review due
            </div>
            <div style={{ color: overdue ? "var(--p-review-fg)" : "var(--ink)" }}>
              {profile.kycNextReviewDate
                ? formatDate(profile.kycNextReviewDate)
                : "Not scheduled"}
            </div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
              Notes
            </div>
            <div style={{ color: "var(--ink-2)", whiteSpace: "normal" }}>
              {profile.kycNotes ?? "—"}
            </div>
          </div>
        </div>

        {canWrite && (
          <form action={updateKycProfileAction}>
            <input type="hidden" name="subjectType" value={subjectType} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div
              className="flex flex-col gap-3 px-3.5 py-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <Row>
                <SelectField
                  label="KYC status"
                  name="kycStatus"
                  defaultValue={profile.kycStatus}
                >
                  {KYC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {KYC_STATUS_LABELS[s]}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Risk rating"
                  name="riskRating"
                  defaultValue={profile.riskRating ?? ""}
                >
                  <option value="">— Unrated —</option>
                  {RISK_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {RISK_RATING_LABELS[r]}
                    </option>
                  ))}
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Sanctions checked"
                  name="sanctionsCheckedAt"
                  type="date"
                  defaultValue={profile.sanctionsCheckedAt?.slice(0, 10) ?? ""}
                />
                <Field
                  label="Next review date"
                  name="kycNextReviewDate"
                  type="date"
                  defaultValue={profile.kycNextReviewDate ?? ""}
                  help="Review becomes Overdue once this date passes — regardless of status."
                />
              </Row>
              <label
                className="flex items-center gap-2 text-[12.5px]"
                style={{ color: "var(--ink-2)" }}
              >
                <input type="checkbox" name="pepFlag" defaultChecked={profile.pepFlag} />
                Politically exposed person (PEP)
              </label>
              <TextareaField
                label="KYC notes"
                name="kycNotes"
                defaultValue={profile.kycNotes ?? ""}
                placeholder="Source of wealth, screening hits reviewed, EDD steps…"
              />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Save KYC profile
                </Button>
              </div>
            </div>
          </form>
        )}

        {canWrite && (
          <form action={logKycReviewAction}>
            <input type="hidden" name="subjectType" value={subjectType} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div
              className="flex items-end gap-3 flex-wrap px-3.5 py-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <Field
                label="Review date"
                name="reviewDate"
                type="date"
                required
                defaultValue={todayIso()}
              />
              <SelectField label="Outcome" name="outcome" required defaultValue="cleared">
                {KYC_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {KYC_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Risk after" name="riskRatingAfter" defaultValue="">
                <option value="">— Unchanged —</option>
                {RISK_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {RISK_RATING_LABELS[r]}
                  </option>
                ))}
              </SelectField>
              <Field label="Notes" name="notes" placeholder="Findings, screening refs…" />
              <Button variant="secondary" type="submit">
                Log review
              </Button>
              <span className="text-[11px] mb-1.5" style={{ color: "var(--ink-4)" }}>
                Cleared → verified; next review auto-schedules 12/6/3 months out
                for low/medium/high risk.
              </span>
            </div>
          </form>
        )}

        {recentReviews.length > 0 && (
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Reviewed</TH>
                <TH>Outcome</TH>
                <TH>Risk after</TH>
                <TH>Reviewer</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {recentReviews.map((r) => (
                <TR key={r.id}>
                  <TD>{formatDate(r.reviewDate)}</TD>
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
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Card>
  );
}
