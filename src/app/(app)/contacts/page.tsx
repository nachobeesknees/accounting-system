import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { IconContact } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getContacts } from "@/lib/data";
import type { Contact } from "@/lib/types";

function tagPills(c: Contact) {
  const pills = [];
  if (c.isClient) pills.push(<Pill key="cli" variant="active">Client</Pill>);
  if (c.isVendor) pills.push(<Pill key="ven" variant="formation">Vendor</Pill>);
  if (c.isEmployee) pills.push(<Pill key="emp" variant="pending">Employee</Pill>);
  if (c.isIntermediary) pills.push(<Pill key="int" variant="neutral">Intermediary</Pill>);
  if (pills.length === 0) pills.push(<Pill key="none" variant="neutral">Contact</Pill>);
  return <div className="flex gap-1 flex-wrap">{pills}</div>;
}

function filterContacts(contacts: Contact[], q: string, tag: string): Contact[] {
  const needle = q.trim().toLowerCase();
  return contacts.filter((c) => {
    if (tag === "client" && !c.isClient) return false;
    if (tag === "vendor" && !c.isVendor) return false;
    if (tag === "employee" && !c.isEmployee) return false;
    if (tag === "intermediary" && !c.isIntermediary) return false;
    if (needle) {
      const hay =
        `${c.code} ${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const tag = params.tag ?? "";

  const all = await getContacts();
  const rows = filterContacts(all, q, tag);
  const stats = {
    clients: all.filter((c) => c.isClient).length,
    vendors: all.filter((c) => c.isVendor).length,
    employees: all.filter((c) => c.isEmployee).length,
    intermediaries: all.filter((c) => c.isIntermediary).length,
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        meta={`${rows.length} of ${all.length} contacts · ${stats.clients} clients · ${stats.vendors} vendors · ${stats.employees} employees · ${stats.intermediaries} intermediaries`}
        actions={
          <ButtonLink variant="primary" href="/contacts/new">
            + New contact
          </ButtonLink>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          <Field label="Search" name="q" placeholder="Name, code, email" defaultValue={q} />
          <SelectField label="Tag" name="tag" defaultValue={tag}>
            <option value="">All</option>
            <option value="client">Clients</option>
            <option value="vendor">Vendors</option>
            <option value="employee">Employees</option>
            <option value="intermediary">Intermediaries</option>
          </SelectField>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/contacts">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Contacts">
          {rows.length === 0 ? (
            <Empty
              icon={<IconContact size={20} />}
              title={
                all.length === 0
                  ? "No contacts yet"
                  : "No contacts match these filters"
              }
              body={
                all.length === 0
                  ? "Contacts are the people behind your entities — clients, employees, vendors, and intermediaries."
                  : "Try clearing filters or add a new contact."
              }
              cta={
                <ButtonLink variant="primary" href="/contacts/new">
                  + New contact
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Kind</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>Tags</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.id}>
                    <TD mono>
                      <Link
                        href={`/contacts/${c.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {c.code}
                      </Link>
                    </TD>
                    <TD>{c.name}</TD>
                    <TD
                      style={{
                        color: "var(--ink-3)",
                        fontSize: 11.5,
                        textTransform: "capitalize",
                      }}
                    >
                      {c.kind}
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>{c.email ?? "—"}</TD>
                    <TD mono style={{ color: "var(--ink-3)" }}>
                      {c.phone ?? "—"}
                    </TD>
                    <TD>{tagPills(c)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
