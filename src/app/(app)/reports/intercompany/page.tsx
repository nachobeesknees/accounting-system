import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getFirmEntities,
  getIntercompanyPairBalances,
  type IntercompanyPairBalance,
} from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { generateEliminationAction } from "./actions";

/**
 * Intercompany report — every (entity A, entity B) pair with open
 * non-eliminated intercompany activity. For each unordered pair we show:
 *   - A → B: amounts B owes A (A's "due from B" balance)
 *   - B → A: amounts A owes B (A's "due to B" balance)
 *   - Net: A's net receivable from B
 *   - Reconciles: whether each side's books mirror the other (green/red)
 *
 * The matrix is the canonical view; eliminations are generated per pair
 * from the inline form.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [firmEntities, pairs] = await Promise.all([
    getFirmEntities(),
    getIntercompanyPairBalances(),
  ]);
  const firmById = new Map(firmEntities.map((e) => [e.id, e] as const));

  // Bucket pairs into unordered pair keys A↔B (the smaller id first) so
  // each row shows both directions side-by-side.
  const grouped = groupByUnorderedPair(pairs);

  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, compact: true, hideCurrency: true });

  return (
    <>
      <PageHeader
        title="Intercompany"
        meta="Open balances between firm entities. Generate eliminations to net them out at the consolidated view."
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

        <Card title="Entity-pair balances">
          {grouped.length === 0 ? (
            <Empty
              title="No open intercompany balances"
              body="Mark a JE line as intercompany by setting its counterpart entity on the new-entry form. Posted intercompany lines show up here, grouped by entity pair."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Entity A</TH>
                  <TH>Entity B</TH>
                  <TH num>A → B (due from B)</TH>
                  <TH num>B → A (due from A)</TH>
                  <TH num>Net (A&apos;s receivable)</TH>
                  <TH>Reconciles?</TH>
                  <TH>Action</TH>
                </TR>
              </THead>
              <TBody>
                {grouped.map((g) => {
                  const a = g.aEntityId
                    ? firmById.get(g.aEntityId)
                    : undefined;
                  const b = firmById.get(g.bEntityId);
                  const aLabel = g.aEntityId
                    ? a
                      ? `${a.code} — ${a.name}`
                      : g.aEntityId
                    : "Firm-level";
                  const bLabel = b ? `${b.code} — ${b.name}` : g.bEntityId;
                  return (
                    <TR key={g.key}>
                      <TD>{aLabel}</TD>
                      <TD>{bLabel}</TD>
                      <TD num>{fmt(g.aDueFromB)}</TD>
                      <TD num>{fmt(g.bDueFromA)}</TD>
                      <TD num neg={g.net < 0}>
                        {fmt(g.net)}
                      </TD>
                      <TD>
                        {g.reconciles ? (
                          <Pill variant="active">Match</Pill>
                        ) : g.partial ? (
                          <Pill variant="pending">One-sided</Pill>
                        ) : (
                          <Pill variant="review">Mismatch</Pill>
                        )}
                      </TD>
                      <TD>
                        {g.aEntityId ? (
                          <form action={generateEliminationAction}>
                            <input
                              type="hidden"
                              name="entityAId"
                              value={g.aEntityId}
                            />
                            <input
                              type="hidden"
                              name="entityBId"
                              value={g.bEntityId}
                            />
                            <Button variant="secondary" type="submit">
                              Generate elimination
                            </Button>
                          </form>
                        ) : (
                          <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                            (firm-level legs cannot be eliminated)
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="How this works">
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-2)",
              lineHeight: 1.55,
              padding: "4px 12px 8px",
            }}
          >
            <p>
              When a JE line has a counterpart firm entity set, it&apos;s an
              intercompany leg. The &quot;A → B&quot; column sums debits where
              A is the issuing entity and B is the counterpart — i.e. amounts
              receivable on A&apos;s books from B (&quot;Due From B&quot;).
              The &quot;B → A&quot; column is the mirror.
            </p>
            <p style={{ marginTop: 8 }}>
              A reconciled pair (green) is what you want before close: each
              side&apos;s books mirror the other. Generating an elimination
              posts a firm-level JE flagged with{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>
                elimination_entry_id
              </code>{" "}
              that reverses the open net per account. Eliminations are
              <strong> hidden</strong> when drilling into an individual
              entity&apos;s books but <strong>included</strong> in the
              firm-level consolidated view.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

// ------- helpers (pure) -------

type GroupedPair = {
  key: string;
  aEntityId: string | null;
  bEntityId: string;
  /** A→B: amounts B owes A (sum of debits on A's books w/ counterpart B). */
  aDueFromB: number;
  /** B→A: amounts A owes B (sum of debits on B's books w/ counterpart A). */
  bDueFromA: number;
  /** A's net receivable position. */
  net: number;
  /** Both sides recorded mirroring activity within $0.01. */
  reconciles: boolean;
  /** Only one side recorded activity — flag for manual review. */
  partial: boolean;
};

function groupByUnorderedPair(pairs: IntercompanyPairBalance[]): GroupedPair[] {
  // Order key so (A, B) and (B, A) collapse into one row. Firm-level
  // (fromEntityId === null) is treated as a distinct "left side" — those
  // pairs can't be eliminated since one leg has no scoped books to net.
  const map = new Map<string, GroupedPair>();
  for (const p of pairs) {
    const left = p.fromEntityId ?? "_firm";
    const right = p.toEntityId;
    const [a, b] = left < right ? [left, right] : [right, left];
    const key = `${a}|${b}`;
    const aEntityId = a === "_firm" ? null : a;
    const bEntityId = b;
    const cur =
      map.get(key) ??
      ({
        key,
        aEntityId,
        bEntityId,
        aDueFromB: 0,
        bDueFromA: 0,
        net: 0,
        reconciles: false,
        partial: false,
      } as GroupedPair);
    // dueFrom (debit) on the from-side adds to that side's "A→B" total.
    // If this pair row's from === a, we accumulate aDueFromB; else bDueFromA.
    if (left === a) {
      cur.aDueFromB += p.dueFrom;
      // Credits booked on side A (= a) are amounts A owes B → from B's
      // perspective that's bDueFromA.
      cur.bDueFromA += p.dueTo;
    } else {
      cur.bDueFromA += p.dueFrom;
      cur.aDueFromB += p.dueTo;
    }
    map.set(key, cur);
  }
  // Net + reconciliation flags.
  for (const g of map.values()) {
    g.net = g.aDueFromB - g.bDueFromA;
    const oneSided = (g.aDueFromB === 0) !== (g.bDueFromA === 0);
    g.partial = oneSided;
    g.reconciles = !oneSided && Math.abs(g.net) < 0.01;
  }
  // Stable order: firm-level first, then by larger absolute net.
  return Array.from(map.values()).sort((x, y) => {
    if (x.aEntityId == null && y.aEntityId != null) return -1;
    if (y.aEntityId == null && x.aEntityId != null) return 1;
    return Math.abs(y.net) - Math.abs(x.net);
  });
}
