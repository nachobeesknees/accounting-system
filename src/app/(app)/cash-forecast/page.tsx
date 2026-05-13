import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, type PillVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { DEMO_TODAY, getKpis } from "@/lib/data";
import { getCashForecast, type ForecastItem } from "@/lib/forecast";
import { formatDate } from "@/lib/format";
import { formatUSD } from "@/lib/money";

const ALLOWED_HORIZONS = [4, 13, 26, 52] as const;
type Horizon = (typeof ALLOWED_HORIZONS)[number];

function parseHorizon(raw: string | undefined): Horizon {
  if (!raw) return 13;
  const n = parseInt(raw, 10);
  return (ALLOWED_HORIZONS as readonly number[]).includes(n)
    ? (n as Horizon)
    : 13;
}

function kindLabel(kind: ForecastItem["kind"]): string {
  switch (kind) {
    case "invoice":
      return "Invoice";
    case "entity_fee":
      return "Entity fee";
    case "bill":
      return "Bill";
    case "recurring":
      return "Recurring";
  }
}

function kindVariant(kind: ForecastItem["kind"]): PillVariant {
  switch (kind) {
    case "invoice":
      return "active";
    case "entity_fee":
      return "formation";
    case "bill":
      return "pending";
    case "recurring":
      return "review";
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const params = await searchParams;
  const weeks = parseHorizon(params.weeks);

  const kpis = await getKpis();
  const { rows, items } = await getCashForecast(kpis.cash, DEMO_TODAY, weeks);

  const totalInflows = rows.reduce(
    (s, r) => s + r.inflowsFromInvoices + r.inflowsFromEntityFees,
    0,
  );
  const totalOutflows = rows.reduce(
    (s, r) => s + r.outflowsFromBills + r.outflowsFromRecurring,
    0,
  );
  const projectedEnding =
    rows.length > 0 ? rows[rows.length - 1].endingBalance : kpis.cash;

  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader
        title="Cash Forecast"
        meta={`Starting balance ${formatUSD(kpis.cash)} · ${weeks}-week horizon`}
        actions={
          <ButtonLink href="/cash-forecast/recurring" variant="secondary">
            Recurring payments
          </ButtonLink>
        }
      />

      <div
        className="px-6 py-2 flex gap-1.5 flex-wrap items-center"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span
          className="text-[11.5px] mr-1"
          style={{ color: "var(--ink-3)" }}
        >
          Horizon
        </span>
        {ALLOWED_HORIZONS.map((h) => (
          <ButtonLink
            key={h}
            href={`/cash-forecast?weeks=${h}`}
            variant={h === weeks ? "primary" : "secondary"}
          >
            {h} weeks
          </ButtonLink>
        ))}
      </div>

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <Card title="Projected ending balance" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color:
                  projectedEnding >= 0
                    ? "var(--p-active-fg)"
                    : "var(--p-review-fg)",
              }}
            >
              {formatUSD(projectedEnding, { paren: true })}
            </div>
            <div
              className="text-[11.5px] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              After {weeks} weeks
            </div>
          </Card>
          <Card title="Total projected inflows" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--p-active-fg)",
              }}
            >
              {formatUSD(totalInflows)}
            </div>
            <div
              className="text-[11.5px] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              Invoices + entity fees
            </div>
          </Card>
          <Card title="Total projected outflows" bodyPadding>
            <div
              className="text-[20px] font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--p-review-fg)",
              }}
            >
              {formatUSD(totalOutflows)}
            </div>
            <div
              className="text-[11.5px] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              Bills + recurring payments
            </div>
          </Card>
        </div>

        <Card title="Weekly cash flow">
          {rows.length === 0 ? (
            <Empty
              title="No forecast rows"
              body="The forecast horizon produced no weekly buckets."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Week of</TH>
                  <TH num>Inflows: invoices</TH>
                  <TH num>Inflows: fees</TH>
                  <TH num>Outflows: bills</TH>
                  <TH num>Outflows: recurring</TH>
                  <TH num>Net delta</TH>
                  <TH num>Ending balance</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.weekStart} hover={false}>
                    <TD mono>{formatDate(r.weekStart)}</TD>
                    <TD num>{formatUSD(r.inflowsFromInvoices)}</TD>
                    <TD num>{formatUSD(r.inflowsFromEntityFees)}</TD>
                    <TD num>{formatUSD(r.outflowsFromBills)}</TD>
                    <TD num>{formatUSD(r.outflowsFromRecurring)}</TD>
                    <TD num neg={r.netDelta < 0}>
                      {formatUSD(r.netDelta, { paren: true })}
                    </TD>
                    <TD num neg={r.endingBalance < 0}>
                      {formatUSD(r.endingBalance, { paren: true })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Forecast detail">
          {sortedItems.length === 0 ? (
            <Empty
              title="No forecast events"
              body="No invoices, bills, fees, or recurring payments fall within this horizon."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Description</TH>
                  <TH num>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {sortedItems.map((it, idx) => {
                  const signed = it.isOutflow ? -it.amount : it.amount;
                  return (
                    <TR
                      key={`${it.kind}-${it.date}-${idx}`}
                      href={it.href}
                    >
                      <TD mono>{formatDate(it.date)}</TD>
                      <TD>
                        <Pill variant={kindVariant(it.kind)}>
                          {kindLabel(it.kind)}
                        </Pill>
                      </TD>
                      <TD>{it.description}</TD>
                      <TD num neg={it.isOutflow}>
                        {formatUSD(signed, { paren: true })}
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
