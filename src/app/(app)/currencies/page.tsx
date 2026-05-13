import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getCurrencies, getFxRates } from "@/lib/data";
import { formatDate } from "@/lib/format";
import {
  addCurrencyAction,
  addFxRateAction,
  deleteCurrencyAction,
  deleteFxRateAction,
  setBaseCurrencyAction,
  toggleActiveAction,
} from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [currencies, rates] = await Promise.all([getCurrencies(), getFxRates()]);
  const base = currencies.find((c) => c.isBase);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Currencies / FX"
        meta={`${currencies.length} currencies · base ${base?.code ?? "—"} · ${rates.length} FX snapshots`}
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && <Banner tone="error">{error}</Banner>}
        {saved && <Banner tone="success">Saved.</Banner>}

        <Card title="Currencies">
          {currencies.length === 0 ? (
            <Empty title="No currencies yet" body="Add one below." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Symbol</TH>
                  <TH>Name</TH>
                  <TH num>Decimals</TH>
                  <TH>Base</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {currencies.map((c) => (
                  <TR key={c.code}>
                    <TD mono>{c.code}</TD>
                    <TD mono>{c.symbol}</TD>
                    <TD>{c.name}</TD>
                    <TD num>{c.decimals}</TD>
                    <TD>
                      {c.isBase ? (
                        <Pill variant="active">Base</Pill>
                      ) : (
                        <form action={setBaseCurrencyAction}>
                          <input type="hidden" name="code" value={c.code} />
                          <Button variant="ghost" type="submit">
                            Make base
                          </Button>
                        </form>
                      )}
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(c.isActive ? "active" : "inactive")}>
                        {statusLabel(c.isActive ? "active" : "inactive")}
                      </Pill>
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <form action={toggleActiveAction}>
                          <input type="hidden" name="code" value={c.code} />
                          <input
                            type="hidden"
                            name="active"
                            value={c.isActive ? "on" : ""}
                          />
                          <Button variant="ghost" type="submit">
                            {c.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
                        {!c.isBase && (
                          <form action={deleteCurrencyAction}>
                            <input type="hidden" name="code" value={c.code} />
                            <ConfirmButton
                              variant="ghost"
                              title={`Remove currency ${c.code}?`}
                              body="This deletes the currency. It will fail if any account, customer, vendor, or transaction still references it."
                              confirmLabel="Remove"
                            >
                              Remove
                            </ConfirmButton>
                          </form>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={addCurrencyAction}>
          <Card title="Add currency">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Code" name="code" required mono placeholder="AUD" maxLength={6} />
                <Field label="Symbol" name="symbol" required mono placeholder="A$" />
              </Row>
              <Row>
                <Field label="Name" name="name" required placeholder="Australian Dollar" />
                <Field label="Decimals" name="decimals" mono type="number" defaultValue="2" />
              </Row>
              <Row>
                <label className="flex items-end gap-2 text-[13px]">
                  <input type="checkbox" name="isBase" />
                  <span style={{ color: "var(--ink-2)" }}>
                    Set as base currency (replaces existing base)
                  </span>
                </label>
                <div />
              </Row>
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add currency
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <Card title="FX rates" actions={<span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>Rate = units of foreign per 1 {base?.code ?? "base"}</span>}>
          {rates.length === 0 ? (
            <Empty title="No FX rates" body="Record a snapshot below." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>Currency</TH>
                  <TH num>Rate / base</TH>
                  <TH>Source</TH>
                  <TH>Notes</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {rates.map((r) => (
                  <TR key={r.id}>
                    <TD>{formatDate(r.rateDate)}</TD>
                    <TD mono>{r.currencyCode}</TD>
                    <TD num>{parseFloat(r.ratePerBase).toFixed(4)}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>{r.source ?? "—"}</TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{r.notes ?? "—"}</TD>
                    <TD>
                      <form action={deleteFxRateAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton
                          variant="ghost"
                          title="Remove FX rate snapshot?"
                          body={`Removes the ${r.currencyCode} rate dated ${formatDate(r.rateDate)}. Reports that referenced this snapshot will fall back to the next-latest rate.`}
                          confirmLabel="Remove"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={addFxRateAction}>
          <Card title="Add FX rate snapshot">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="Currency" name="currencyCode" required defaultValue="">
                  <option value="" disabled>
                    Select currency…
                  </option>
                  {currencies
                    .filter((c) => !c.isBase)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                </SelectField>
                <Field label="Rate date" name="rateDate" type="date" required defaultValue={today} />
              </Row>
              <Row>
                <Field
                  label={`Rate per 1 ${base?.code ?? "base"}`}
                  name="ratePerBase"
                  required
                  mono
                  inputMode="decimal"
                  placeholder="0.0000"
                />
                <Field label="Source" name="source" placeholder="ECB / BOE / manual" />
              </Row>
              <Field label="Notes" name="notes" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add rate
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
