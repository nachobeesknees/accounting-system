import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getJournalEntryByNumber,
  getPeriods,
  getUserById,
  isBalanced,
  totalCredits,
  totalDebits,
} from "@/lib/data";
import { formatUSD, parseAmount } from "@/lib/money";
import { postEntry, voidEntry } from "./actions";

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

  const [periods, accounts, postedByUser] = await Promise.all([
    getPeriods(),
    getAccounts(),
    entry.postedBy ? getUserById(entry.postedBy) : Promise.resolve(null),
  ]);
  const period = entry.fiscalPeriodId
    ? periods.find((p) => p.id === entry.fiscalPeriodId)
    : null;
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  const debitTotal = totalDebits(entry);
  const creditTotal = totalCredits(entry);
  const balanced = isBalanced(entry);

  const activeTab = tab === "activity" ? "activity" : "lines";

  const headerActions = (
    <>
      <ButtonLink variant="secondary" href="/journal">
        ← All entries
      </ButtonLink>
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
            <Button variant="danger" type="submit">
              Void
            </Button>
          </form>
        </>
      )}
      {entry.status === "posted" && (
        <form action={voidEntry}>
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="reason" value="Voided from detail" />
          <Button variant="danger" type="submit">
            Void
          </Button>
        </form>
      )}
    </>
  );

  return (
    <>
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
                    {formatUSD(debitTotal)}
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
                    {formatUSD(creditTotal)}
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
                        {line.description ?? "—"}
                      </TD>
                      <TD num>{d === 0 ? "—" : formatUSD(d)}</TD>
                      <TD num>{c === 0 ? "—" : formatUSD(c)}</TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>Totals</TD>
                  <TD num>{formatUSD(debitTotal)}</TD>
                  <TD num>{formatUSD(creditTotal)}</TD>
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
      </div>
    </>
  );
}
