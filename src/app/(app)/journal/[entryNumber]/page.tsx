import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Empty } from "@/components/ui/Empty";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getDimensionsWithValues,
  getJournalEntryByNumber,
  getPeriods,
  getUserById,
  isBalanced,
  totalCredits,
  totalDebits,
} from "@/lib/data";
import { formatMoney, parseAmount } from "@/lib/money";
import { postEntry, voidEntry } from "./actions";
import { duplicateJournalEntryAction } from "../../duplicate-actions";
import { Attachments } from "@/components/Attachments";

function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ entryNumber: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { entryNumber } = await params;
  const { tab, error } = await searchParams;
  const entry = await getJournalEntryByNumber(entryNumber);
  if (!entry) notFound();

  const [periods, accounts, postedByUser, dimensionsWithValues] =
    await Promise.all([
      getPeriods(),
      getAccounts(),
      entry.postedBy ? getUserById(entry.postedBy) : Promise.resolve(null),
      getDimensionsWithValues(),
    ]);
  const period = entry.fiscalPeriodId
    ? periods.find((p) => p.id === entry.fiscalPeriodId)
    : null;
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  // Lookups for resolving dimension keys/value ids → labels on the readback.
  const dimensionByKey = new Map(
    dimensionsWithValues.map((d) => [d.dimension.key, d.dimension] as const),
  );
  const dimensionValueById = new Map(
    dimensionsWithValues.flatMap((d) =>
      d.values.map((v) => [v.id, v] as const),
    ),
  );
  function renderDimensions(
    dims: Record<string, string> | undefined,
  ): string | null {
    if (!dims) return null;
    const parts: string[] = [];
    for (const [key, valueId] of Object.entries(dims)) {
      if (!valueId) continue;
      const dim = dimensionByKey.get(key);
      const val = dimensionValueById.get(valueId);
      if (!dim || !val) continue;
      parts.push(`${dim.label}: ${val.label}`);
    }
    return parts.length === 0 ? null : parts.join(" · ");
  }

  const debitTotal = totalDebits(entry);
  const creditTotal = totalCredits(entry);
  const balanced = isBalanced(entry);

  const activeTab = tab === "activity" ? "activity" : "lines";

  const headerActions = (
    <>
      <ButtonLink variant="secondary" href="/journal">
        ← All entries
      </ButtonLink>
      <form action={duplicateJournalEntryAction} style={{ display: "inline-flex" }}>
        <input type="hidden" name="entryId" value={entry.id} />
        <Button variant="secondary" type="submit">
          Duplicate
        </Button>
      </form>
      {entry.status === "draft" && (
        <>
          <form action={postEntry}>
            <input type="hidden" name="entryId" value={entry.id} />
            <Button variant="primary" type="submit">
              Post
            </Button>
          </form>
          <form action={voidEntry}>
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="reason" value="Voided from detail" />
            <ConfirmButton
              label="Void"
              title={`Void ${entry.entryNumber}?`}
              message="Voiding a draft entry hides it from the ledger but keeps an audit record. This action cannot be undone."
              confirmText="Void entry"
            />
          </form>
        </>
      )}
      {entry.status === "posted" && (
        <form action={voidEntry}>
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="reason" value="Voided from detail" />
          <ConfirmButton
            label="Void"
            title={`Void posted entry ${entry.entryNumber}?`}
            message="Voiding a posted entry reverses its impact on the ledger and the period totals. Make sure you intend to reverse this entry — the action cannot be undone."
            confirmText="Void entry"
            requirePhrase={entry.entryNumber}
          />
        </form>
      )}
    </>
  );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Journal entries", href: "/journal" },
          { label: entry.entryNumber },
        ]}
      />
      <PageHeader
        title={entry.entryNumber}
        meta={entry.description ?? undefined}
        actions={headerActions}
      />

      <Tabs
        tabs={[
          {
            id: "lines",
            label: "Lines",
            href: `/journal/${entry.entryNumber}`,
            count: entry.lines.length,
          },
          {
            id: "activity",
            label: "Activity",
            href: `/journal/${entry.entryNumber}?tab=activity`,
          },
        ]}
        activeId={activeTab}
      />

      <div className="flex flex-col gap-3.5 px-6 py-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}

        <Card
          title="Header"
          actions={
            <>
              <Pill variant={statusVariant(entry.status)}>
                {statusLabel(entry.status)}
              </Pill>
              <Pill variant={balanced ? "active" : "review"}>
                {balanced ? "Balanced" : "Unbalanced"}
              </Pill>
              {entry.bypassControlWarning && (
                <Pill variant="review">Direct post (bypass)</Pill>
              )}
            </>
          }
        >
          <KVGrid>
            <KV k="Entry #" v={entry.entryNumber} mono />
            <KV k="Period" v={period ? period.name : "—"} />
            <KV k="Entry date" v={formatLongDate(entry.entryDate)} />
            <KV
              k="Reference"
              v={entry.reference ?? "—"}
              mono={entry.reference != null}
            />
            <KV k="Description" v={entry.description ?? "—"} />
            <KV
              k="Source"
              v={
                <span style={{ textTransform: "capitalize" }}>
                  {entry.source}
                </span>
              }
            />
            {entry.postedAt && (
              <KV
                k="Posted"
                v={formatDateTime(entry.postedAt)}
                sub={postedByUser ? `by ${postedByUser.fullName}` : null}
              />
            )}
            {entry.voidedAt && (
              <KV
                k="Voided"
                v={formatDateTime(entry.voidedAt)}
                sub={entry.voidReason ?? null}
              />
            )}
          </KVGrid>
        </Card>

        {activeTab === "lines" ? (
          <Card
            title="Line items"
            actions={
              <>
                <span>
                  Debit total:{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--ink)",
                    }}
                  >
                    {formatMoney(debitTotal, "USD")}
                  </span>
                </span>
                <span>·</span>
                <span>
                  Credit total:{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--ink)",
                    }}
                  >
                    {formatMoney(creditTotal, "USD")}
                  </span>
                </span>
              </>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>#</TH>
                  <TH>Account</TH>
                  <TH>Name</TH>
                  <TH>Description</TH>
                  <TH num>Debit</TH>
                  <TH num>Credit</TH>
                </TR>
              </THead>
              <TBody>
                {entry.lines.map((line) => {
                  const account = accountById.get(line.accountId);
                  const d = parseAmount(line.debit);
                  const c = parseAmount(line.credit);
                  return (
                    <TR key={line.id}>
                      <TD
                        mono
                        style={{ color: "var(--ink-3)", width: 40 }}
                      >
                        {line.lineNumber}
                      </TD>
                      <TD mono>{account?.code ?? "—"}</TD>
                      <TD>{account?.name ?? "—"}</TD>
                      <TD
                        style={{
                          color: "var(--ink-3)",
                          fontSize: 11.5,
                        }}
                      >
                        <div>{line.description ?? "—"}</div>
                        {(() => {
                          const text = renderDimensions(line.dimensions);
                          return text ? (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--ink-4)",
                                marginTop: 2,
                              }}
                            >
                              {text}
                            </div>
                          ) : null;
                        })()}
                      </TD>
                      <TD num>{d === 0 ? "—" : formatMoney(d, "USD")}</TD>
                      <TD num>{c === 0 ? "—" : formatMoney(c, "USD")}</TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>Totals</TD>
                  <TD num>{formatMoney(debitTotal, "USD")}</TD>
                  <TD num>{formatMoney(creditTotal, "USD")}</TD>
                </TR>
              </TBody>
            </Table>
          </Card>
        ) : (
          <Card title="Activity">
            <Empty
              title="Activity log coming soon"
              body="We'll record posts, voids and edits here."
            />
          </Card>
        )}

        <Attachments
          recordType="journal_entry"
          recordId={entry.id}
          redirectPath={`/journal/${entry.entryNumber}`}
        />
      </div>
    </>
  );
}
