import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getOffices, getPriceLists } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ office?: string }>;
}) {
  const params = await searchParams;
  const [offices, allLists] = await Promise.all([getOffices(), getPriceLists()]);
  const officeById = new Map(offices.map((o) => [o.id, o] as const));
  const lists = params.office
    ? allLists.filter((p) => p.officeId === params.office)
    : allLists;
  const officeFilter = params.office ? officeById.get(params.office) : undefined;

  // Group by office for display
  const grouped = new Map<string, typeof lists>();
  for (const p of lists) {
    const arr = grouped.get(p.officeId) ?? [];
    arr.push(p);
    grouped.set(p.officeId, arr);
  }

  return (
    <>
      <PageHeader
        title="Price Lists"
        meta={officeFilter ? `Filtered to ${officeFilter.name}` : `${lists.length} versions across ${offices.length} offices`}
        actions={
          <ButtonLink variant="primary" href="/price-lists/new">
            + New price list
          </ButtonLink>
        }
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        {grouped.size === 0 && (
          <Card title="Price lists">
            <Empty
              title="No price lists yet"
              body="Create one or duplicate from an existing list to start a new version."
              cta={
                <ButtonLink variant="primary" href="/price-lists/new">
                  + New price list
                </ButtonLink>
              }
            />
          </Card>
        )}
        {Array.from(grouped.entries()).map(([officeId, versions]) => {
          const office = officeById.get(officeId);
          const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
          return (
            <Card
              key={officeId}
              title={office ? `${office.code} — ${office.name}` : officeId}
            >
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH>Version</TH>
                    <TH>Name</TH>
                    <TH>Effective</TH>
                    <TH>Current</TH>
                    <TH>Status</TH>
                    <TH>Parent</TH>
                  </TR>
                </THead>
                <TBody>
                  {sorted.map((p) => (
                    <TR key={p.id}>
                      <TD mono>v{p.versionNumber}</TD>
                      <TD>
                        <Link
                          href={`/price-lists/${p.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {p.name}
                        </Link>
                      </TD>
                      <TD>{formatDate(p.effectiveDate)}</TD>
                      <TD>
                        {p.isCurrent ? (
                          <Pill variant="active">Current</Pill>
                        ) : (
                          <Pill variant="neutral">Historical</Pill>
                        )}
                      </TD>
                      <TD>
                        <Pill variant={statusVariant(p.isActive ? "active" : "inactive")}>
                          {statusLabel(p.isActive ? "active" : "inactive")}
                        </Pill>
                      </TD>
                      <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                        {p.parentVersionId ?? "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
