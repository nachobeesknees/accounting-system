import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getPeriods } from "@/lib/data";
import { togglePeriod } from "./actions";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function Page() {
  const rows = await getPeriods();

  return (
    <>
      <PageHeader
        title="Fiscal Periods"
        meta={`${rows.length} configured`}
        actions={
          <Button variant="primary" disabled>
            + New period
          </Button>
        }
      />

      <div className="px-6 py-3.5">
        <Card title="Periods">
          {rows.length === 0 ? (
            <Empty
              title="No fiscal periods configured"
              body="A period defines the date range you can post journal entries against and lets you close the books once a month is finalized."
            />
          ) : (
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Name</TH>
                <TH>Start</TH>
                <TH>End</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const isClosed = p.status === "closed";
                return (
                  <TR key={p.id}>
                    <TD mono>{p.name}</TD>
                    <TD>{formatDate(p.startDate)}</TD>
                    <TD>{formatDate(p.endDate)}</TD>
                    <TD>
                      <Pill variant={statusVariant(p.status)}>
                        {statusLabel(p.status)}
                      </Pill>
                    </TD>
                    <TD>
                      <form action={togglePeriod}>
                        <input type="hidden" name="periodId" value={p.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={p.status}
                        />
                        <Button variant="ghost" type="submit">
                          {isClosed ? "Reopen" : "Close period"}
                        </Button>
                      </form>
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
