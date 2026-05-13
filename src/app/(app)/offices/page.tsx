import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getOffices, getPriceLists } from "@/lib/data";
import { createOfficeAction } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [offices, priceLists] = await Promise.all([getOffices(), getPriceLists()]);
  const plByOffice = new Map<string, number>();
  for (const p of priceLists) {
    plByOffice.set(p.officeId, (plByOffice.get(p.officeId) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Offices" meta={`${offices.length} offices`} />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
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
        {saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Saved.
          </div>
        )}

        <Card title="Offices">
          {offices.length === 0 ? (
            <Empty title="No offices" body="Add an office below." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Address</TH>
                  <TH>Currency</TH>
                  <TH num>Price lists</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {offices.map((o) => (
                  <TR key={o.id}>
                    <TD mono>{o.code}</TD>
                    <TD>{o.name}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>{o.address ?? "—"}</TD>
                    <TD mono>{o.currencyCode}</TD>
                    <TD num>
                      <Link
                        href={`/price-lists?office=${o.id}`}
                        style={{ color: "var(--ink-3)" }}
                      >
                        {plByOffice.get(o.id) ?? 0}
                      </Link>
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(o.isActive ? "active" : "inactive")}>
                        {statusLabel(o.isActive ? "active" : "inactive")}
                      </Pill>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={createOfficeAction}>
          <Card title="Add office">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Code" name="code" required mono placeholder="OFC-XX" />
                <Field
                  label="Name"
                  name="name"
                  required
                  placeholder="Thistlewood — City"
                />
              </Row>
              <Row>
                <Field label="Address" name="address" />
                <Field label="Currency" name="currencyCode" mono maxLength={3} defaultValue="USD" />
              </Row>
              <Row>
                <SelectField label="Status" name="isActive" defaultValue="on">
                  <option value="on">Active</option>
                  <option value="">Inactive</option>
                </SelectField>
                <Field label="Notes" name="notes" />
              </Row>
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add office
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
