import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { PrintButton } from "@/components/PrintButton";
import {
  getBaseCurrency,
  getEliminatedPairKeys,
  getFirmEntities,
  getIntercompanyLinesDetailed,
  getUntaggedIntercompanyLines,
  type IntercompanyLineDetail,
} from "@/lib/data";
import { resolveEntityScope } from "@/lib/entity-scope";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { Office } from "@/lib/types";
import { draftCounterpartAction, generateEliminationAction } from "./actions";

/**
 * Intercompany auto-reconciliation — pair-wise matrix over the counterpart
 * TAGS on posted journal lines (not account numbers, so it reconciles
 * across different Due-from / Due-to accounts on each entity's books).
 *
 * For an ordered pair (A, B): A's net position toward B =
 * Σ(debit − credit) of A's tagged lines with counterpart B, converted to
 * base via each JE's fxRate snapshot (base = native / fxRate; NULL = base).
 * The pair reconciles when A→B + B→A = 0.00 in base.
 */

type PairSide = {
  entityId: string;
  /**
   * Raw Σ(debit − credit). Only a meaningful single-currency figure when
   * every line on the side shares one FX context — lines whose JE has a
   * fxRate are native (office currency); lines with NULL fxRate are
   * base-currency amounts. Mixed sides must display base only.
   */
  native: number;
  /** Σ(debit − credit) / fxRate per line. */
  base: number;
  lineCount: number;
  /** Lines whose JE has no fxRate — i.e. booked directly in base. */
  fxNullCount: number;
};

type PairRow = {
  key: string;
  aEntityId: string;
  bEntityId: string;
  aToB: PairSide;
  bToA: PairSide;
  /** aToB.base + bToA.base, rounded to cents. 0 = reconciled. */
  differenceBase: number;
  reconciled: boolean;
  eliminated: boolean;
  /** The side whose books under-record (target of the counterpart draft). */
  deficientEntityId: string;
  counterpartEntityId: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toBase(l: IntercompanyLineDetail): number {
  const nat = l.debit - l.credit;
  return l.fxRate != null && l.fxRate > 0 ? nat / l.fxRate : nat;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildPairs(
  lines: IntercompanyLineDetail[],
  eliminatedKeys: Set<string>,
): { pairs: PairRow[]; firmLevelLines: IntercompanyLineDetail[] } {
  const firmLevelLines: IntercompanyLineDetail[] = [];
  const sides = new Map<string, PairSide>(); // "from|to" ordered
  for (const l of lines) {
    if (l.fromEntityId == null) {
      // No issuing entity on the JE — can't participate in pair recon.
      firmLevelLines.push(l);
      continue;
    }
    if (l.fromEntityId === l.toEntityId) continue; // self-tag, ignore
    const key = `${l.fromEntityId}|${l.toEntityId}`;
    const cur =
      sides.get(key) ??
      ({
        entityId: l.fromEntityId,
        native: 0,
        base: 0,
        lineCount: 0,
        fxNullCount: 0,
      } as PairSide);
    cur.native += l.debit - l.credit;
    cur.base += toBase(l);
    cur.lineCount += 1;
    if (l.fxRate == null) cur.fxNullCount += 1;
    sides.set(key, cur);
  }

  const byPair = new Map<string, PairRow>();
  for (const [key, side] of sides.entries()) {
    const [from, to] = key.split("|");
    const [a, b] = from < to ? [from, to] : [to, from];
    const uKey = `${a}|${b}`;
    const row =
      byPair.get(uKey) ??
      ({
        key: uKey,
        aEntityId: a,
        bEntityId: b,
        aToB: { entityId: a, native: 0, base: 0, lineCount: 0, fxNullCount: 0 },
        bToA: { entityId: b, native: 0, base: 0, lineCount: 0, fxNullCount: 0 },
        differenceBase: 0,
        reconciled: false,
        eliminated: eliminatedKeys.has(uKey),
        deficientEntityId: b,
        counterpartEntityId: a,
      } as PairRow);
    if (from === a) row.aToB = side;
    else row.bToA = side;
    byPair.set(uKey, row);
  }

  for (const row of byPair.values()) {
    row.aToB.base = round2(row.aToB.base);
    row.bToA.base = round2(row.bToA.base);
    row.aToB.native = round2(row.aToB.native);
    row.bToA.native = round2(row.bToA.native);
    row.differenceBase = round2(row.aToB.base + row.bToA.base);
    row.reconciled = row.differenceBase === 0;
    // Deficient side = the one that recorded less (smaller |base|); ties
    // default to B so the action is deterministic.
    if (Math.abs(row.aToB.base) < Math.abs(row.bToA.base)) {
      row.deficientEntityId = row.aEntityId;
      row.counterpartEntityId = row.bEntityId;
    } else {
      row.deficientEntityId = row.bEntityId;
      row.counterpartEntityId = row.aEntityId;
    }
  }

  const pairs = Array.from(byPair.values()).sort((x, y) => {
    if (x.reconciled !== y.reconciled) return x.reconciled ? 1 : -1;
    return Math.abs(y.differenceBase) - Math.abs(x.differenceBase);
  });
  return { pairs, firmLevelLines };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; pair?: string }>;
}) {
  const { error, pair } = await searchParams;
  const [firmEntities, lines, untagged, eliminatedKeys, base, scope, user] =
    await Promise.all([
      getFirmEntities(),
      getIntercompanyLinesDetailed(),
      getUntaggedIntercompanyLines(),
      getEliminatedPairKeys(),
      getBaseCurrency(),
      resolveEntityScope(),
      getSessionUser(),
    ]);
  const baseCode = base?.code ?? "USD";
  const firmById = new Map(firmEntities.map((e) => [e.id, e] as const));
  const atAllScope = scope.kind === "all";
  const canDraft = hasPermission(user, "journal_entry.create");
  const canEliminate = hasPermission(user, "intercompany.generate_elimination");

  const { pairs, firmLevelLines } = buildPairs(lines, eliminatedKeys);

  // Drill-down selection via ?pair=A:B (unordered).
  const openPair: PairRow | null = (() => {
    if (!pair) return null;
    const [pa, pb] = pair.split(":");
    if (!pa || !pb) return null;
    const k = pairKey(pa, pb);
    return pairs.find((p) => p.key === k) ?? null;
  })();

  const label = (id: string | null): string => {
    if (!id) return "Firm-level";
    const e = firmById.get(id);
    return e ? `${e.code} — ${e.name}` : id;
  };
  const officeCurrency = (id: string): string =>
    firmById.get(id)?.currencyCode ?? baseCode;

  const sideCell = (side: PairSide, office: Office | undefined) => {
    if (side.lineCount === 0) {
      return <span style={{ color: "var(--ink-3)" }}>—</span>;
    }
    const allBase = side.fxNullCount === side.lineCount;
    const mixed = side.fxNullCount > 0 && !allBase;
    if (mixed) {
      // Lines mix FX contexts (some native via a JE fxRate, some booked
      // directly in base with no fxRate — e.g. a posted counterpart
      // draft). A raw native sum would add different currencies, so show
      // the base figure only.
      return (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(side.base, baseCode, { paren: true, compact: true })}
        </span>
      );
    }
    // Homogeneous side: all lines base (label with base code) or all lines
    // carrying an fxRate (label with the office's booking currency).
    const nativeCode = allBase ? baseCode : office?.currencyCode ?? baseCode;
    return (
      <div className="flex flex-col items-end">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(side.native, nativeCode, { paren: true, compact: true })}
        </span>
        {nativeCode !== baseCode || side.native !== side.base ? (
          <span
            className="text-[11px]"
            style={{
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ≈ {formatMoney(side.base, baseCode, { paren: true, compact: true })}
          </span>
        ) : null}
      </div>
    );
  };

  const lineTable = (rows: IntercompanyLineDetail[]) => (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Date</TH>
          <TH>Entry #</TH>
          <TH>Account</TH>
          <TH>Description</TH>
          <TH num>Debit</TH>
          <TH num>Credit</TH>
          <TH num>Base ({baseCode})</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && (
          <TR hover={false}>
            <TD colSpan={7} style={{ color: "var(--ink-3)" }}>
              No tagged lines on this side — that&apos;s the gap.
            </TD>
          </TR>
        )}
        {rows.map((l, i) => (
          <TR key={`${l.entryId}-${l.accountId}-${i}`} hover={false}>
            <TD>{formatDate(l.entryDate)}</TD>
            <TD mono>
              <Link
                href={`/journal/${l.entryNumber}`}
                style={{ color: "var(--ink)", textDecoration: "none" }}
              >
                {l.entryNumber}
              </Link>
            </TD>
            <TD>
              <span style={{ fontFamily: "var(--font-mono)" }}>{l.accountCode}</span>{" "}
              {l.accountName}
            </TD>
            <TD>{l.lineDescription || l.entryDescription || "—"}</TD>
            <TD num>
              {l.debit === 0
                ? ""
                : formatMoney(l.debit, null, { paren: true, hideCurrency: true })}
            </TD>
            <TD num>
              {l.credit === 0
                ? ""
                : formatMoney(l.credit, null, { paren: true, hideCurrency: true })}
            </TD>
            <TD num>
              {formatMoney(round2(toBase(l)), null, {
                paren: true,
                hideCurrency: true,
              })}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <>
      <PageHeader
        title="Intercompany"
        meta={`Auto-reconciliation by counterpart tag · ${pairs.length} entity pair${pairs.length === 1 ? "" : "s"} with tagged posted activity · amounts native + ${baseCode} base`}
        actions={<PrintButton />}
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

        <Card title="Pair-wise reconciliation matrix">
          {pairs.length === 0 ? (
            <Empty
              title="No tagged intercompany activity"
              body="Mark a JE line as intercompany by setting its counterpart entity on the new-entry form. Posted intercompany lines show up here, reconciled pair-by-pair."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Entity A</TH>
                  <TH>Entity B</TH>
                  <TH num>A → B net</TH>
                  <TH num>B → A net</TH>
                  <TH num>Difference ({baseCode})</TH>
                  <TH>Status</TH>
                  {atAllScope && <TH>Elimination</TH>}
                  <TH>Action</TH>
                </TR>
              </THead>
              <TBody>
                {pairs.map((p) => {
                  const a = firmById.get(p.aEntityId);
                  const b = firmById.get(p.bEntityId);
                  const isOpen = openPair?.key === p.key;
                  const drillHref = isOpen
                    ? "/reports/intercompany"
                    : `/reports/intercompany?pair=${encodeURIComponent(`${p.aEntityId}:${p.bEntityId}`)}`;
                  return (
                    <TR key={p.key} hover={false}>
                      <TD>
                        <Link
                          href={drillHref}
                          title={isOpen ? "Collapse detail" : "Show underlying journal lines"}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {isOpen ? "▾ " : "▸ "}
                          {label(p.aEntityId)}
                        </Link>
                      </TD>
                      <TD>{label(p.bEntityId)}</TD>
                      <TD num>{sideCell(p.aToB, a)}</TD>
                      <TD num>{sideCell(p.bToA, b)}</TD>
                      <TD num neg={!p.reconciled}>
                        {formatMoney(p.differenceBase, null, {
                          paren: true,
                          hideCurrency: true,
                        })}
                      </TD>
                      <TD>
                        {p.reconciled ? (
                          <Pill variant="active">Reconciled</Pill>
                        ) : (
                          <Pill variant="review">Mismatch</Pill>
                        )}
                      </TD>
                      {atAllScope && (
                        <TD>
                          {p.eliminated ? (
                            <Pill variant="active">Eliminated</Pill>
                          ) : (
                            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                              Not eliminated
                            </span>
                          )}
                        </TD>
                      )}
                      <TD>
                        <div className="flex gap-2 items-center flex-wrap">
                          {!p.reconciled && canDraft && (
                            <form action={draftCounterpartAction}>
                              <input
                                type="hidden"
                                name="deficientEntityId"
                                value={p.deficientEntityId}
                              />
                              <input
                                type="hidden"
                                name="counterpartEntityId"
                                value={p.counterpartEntityId}
                              />
                              <Button
                                variant="secondary"
                                type="submit"
                                title={`Draft the missing entry on ${label(p.deficientEntityId)} (never posted automatically)`}
                              >
                                Draft counterpart entry
                              </Button>
                            </form>
                          )}
                          {canEliminate && (
                            <form action={generateEliminationAction}>
                              <input
                                type="hidden"
                                name="entityAId"
                                value={p.aEntityId}
                              />
                              <input
                                type="hidden"
                                name="entityBId"
                                value={p.bEntityId}
                              />
                              <Button variant="ghost" type="submit">
                                Generate elimination
                              </Button>
                            </form>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        {openPair && (
          <Card
            title={`Drill-down · ${label(openPair.aEntityId)} ↔ ${label(openPair.bEntityId)}`}
            actions={
              <ButtonLink variant="ghost" href="/reports/intercompany">
                Close
              </ButtonLink>
            }
          >
            <div className="flex flex-col gap-3 p-3.5">
              <div>
                <div
                  className="text-[12px] font-semibold mb-1.5"
                  style={{ color: "var(--ink-2)" }}
                >
                  {label(openPair.aEntityId)} → {label(openPair.bEntityId)} (
                  {officeCurrency(openPair.aEntityId)} books, counterpart-tagged
                  lines)
                </div>
                {lineTable(
                  lines.filter(
                    (l) =>
                      l.fromEntityId === openPair.aEntityId &&
                      l.toEntityId === openPair.bEntityId,
                  ),
                )}
              </div>
              <div>
                <div
                  className="text-[12px] font-semibold mb-1.5"
                  style={{ color: "var(--ink-2)" }}
                >
                  {label(openPair.bEntityId)} → {label(openPair.aEntityId)} (
                  {officeCurrency(openPair.bEntityId)} books, counterpart-tagged
                  lines)
                </div>
                {lineTable(
                  lines.filter(
                    (l) =>
                      l.fromEntityId === openPair.bEntityId &&
                      l.toEntityId === openPair.aEntityId,
                  ),
                )}
              </div>
              {!openPair.reconciled && (
                <div
                  className="rounded-md px-3 py-2 text-[12px]"
                  style={{
                    background: "var(--p-review-bg)",
                    color: "var(--p-review-fg)",
                    border: "1px solid var(--p-review-fg)",
                  }}
                >
                  Off by{" "}
                  {formatMoney(Math.abs(openPair.differenceBase), baseCode, {
                    paren: true,
                  })}{" "}
                  in base — likely a missing or mis-amounted entry on{" "}
                  {label(openPair.deficientEntityId)}.
                </div>
              )}
            </div>
          </Card>
        )}

        {(untagged.length > 0 || firmLevelLines.length > 0) && (
          <Card title="Data-quality warnings">
            <div className="flex flex-col gap-3 p-3.5">
              {untagged.length > 0 && (
                <div>
                  <div
                    className="text-[12px] font-semibold mb-1.5"
                    style={{ color: "var(--p-review-fg)" }}
                  >
                    Untagged intercompany lines ({untagged.length}) — posted
                    lines on Due-from / Due-to accounts with NO counterpart
                    tag. They escape the reconciliation above; open each entry
                    and set the counterpart entity.
                  </div>
                  <Table>
                    <THead>
                      <TR hover={false}>
                        <TH>Date</TH>
                        <TH>Entry #</TH>
                        <TH>Entity</TH>
                        <TH>Account</TH>
                        <TH>Description</TH>
                        <TH num>Debit</TH>
                        <TH num>Credit</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {untagged.map((l, i) => (
                        <TR key={`${l.entryId}-${i}`} hover={false}>
                          <TD>{formatDate(l.entryDate)}</TD>
                          <TD mono>
                            <Link
                              href={`/journal/${l.entryNumber}`}
                              style={{ color: "var(--ink)", textDecoration: "none" }}
                            >
                              {l.entryNumber}
                            </Link>
                          </TD>
                          <TD>{label(l.firmEntityId)}</TD>
                          <TD>
                            <span style={{ fontFamily: "var(--font-mono)" }}>
                              {l.accountCode}
                            </span>{" "}
                            {l.accountName}
                          </TD>
                          <TD>{l.lineDescription || l.entryDescription || "—"}</TD>
                          <TD num>
                            {l.debit === 0
                              ? ""
                              : formatMoney(l.debit, null, {
                                  paren: true,
                                  hideCurrency: true,
                                })}
                          </TD>
                          <TD num>
                            {l.credit === 0
                              ? ""
                              : formatMoney(l.credit, null, {
                                  paren: true,
                                  hideCurrency: true,
                                })}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
              {firmLevelLines.length > 0 && (
                <div>
                  <div
                    className="text-[12px] font-semibold mb-1.5"
                    style={{ color: "var(--p-pending-fg)" }}
                  >
                    Counterpart-tagged lines on firm-level entries (
                    {firmLevelLines.length}) — the parent JE has no issuing
                    firm entity, so these can&apos;t join a pair. Set the
                    entry&apos;s firm entity to include them.
                  </div>
                  {lineTable(firmLevelLines)}
                </div>
              )}
            </div>
          </Card>
        )}

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
              Reconciliation keys off the <strong>counterpart tag</strong> on
              posted journal lines, not GL account numbers — so it works even
              when each entity books through different Due-from / Due-to
              accounts. A pair is <strong>Reconciled</strong> when A&apos;s net
              tagged position toward B plus B&apos;s toward A is exactly 0.00
              in {baseCode} (each line converted with its entry&apos;s FX
              snapshot: base = native ÷ fxRate; entries without a snapshot are
              already in base).
            </p>
            <p style={{ marginTop: 8 }}>
              <strong>Draft counterpart entry</strong> creates a draft (never
              auto-posted) JE on the deficient side: an intercompany line on
              the account that entity has historically used with the
              counterpart, balanced to a suspense/clearing account — review
              both accounts before posting. <strong>Generate elimination</strong>{" "}
              posts a firm-level consolidation adjustment flagged with{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>
                elimination_entry_id
              </code>
              ; eliminations are hidden on single-entity views and included in
              the consolidated (all-entities) view.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
