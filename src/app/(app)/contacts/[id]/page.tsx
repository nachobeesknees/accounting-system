import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { CustomFields } from "@/components/CustomFields";
import { Attachments } from "@/components/Attachments";
import {
  getBankAccountById,
  getContactById,
  getContactLinksByContactId,
  getEntityById,
} from "@/lib/data";
import {
  addLinkAction,
  deleteContactAction,
  deleteLinkAction,
  updateContactAction,
} from "./actions";

const REF_LABEL: Record<string, string> = {
  entity: "Entity",
  bank_account: "Bank account",
  invoice: "Invoice",
  bill: "Bill",
  asset: "Asset",
};

async function resolveLinkLabel(refType: string, refId: string): Promise<string> {
  if (refType === "entity") {
    const e = await getEntityById(refId);
    return e ? `${e.code} — ${e.name}` : refId;
  }
  if (refType === "bank_account") {
    const b = await getBankAccountById(refId);
    return b ? b.name : refId;
  }
  return refId;
}

function linkHref(refType: string, refId: string): string | null {
  if (refType === "entity") return `/entities/${refId}`;
  if (refType === "bank_account") return `/bank/${refId}`;
  if (refType === "invoice") return `/invoices/${refId}`;
  if (refType === "bill") return `/bills/${refId}`;
  if (refType === "asset") return `/aua/${refId}`;
  return null;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const contact = await getContactById(id);
  if (!contact) notFound();

  const links = await getContactLinksByContactId(contact.id);
  const linkLabels = await Promise.all(
    links.map(async (l) => ({
      link: l,
      label: await resolveLinkLabel(l.refType, l.refId),
      href: linkHref(l.refType, l.refId),
    })),
  );

  return (
    <>
      <PageHeader
        title={contact.name}
        meta={contact.code}
        actions={
          <ButtonLink href="/contacts" variant="secondary">
            ← All contacts
          </ButtonLink>
        }
      />

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

        <form action={updateContactAction}>
          <input type="hidden" name="id" value={contact.id} />
          <Card
            title="Contact details"
            actions={
              <div className="flex gap-1 flex-wrap">
                {contact.isClient && <Pill variant="active">Client</Pill>}
                {contact.isVendor && <Pill variant="formation">Vendor</Pill>}
                {contact.isEmployee && <Pill variant="pending">Employee</Pill>}
                {contact.isIntermediary && <Pill variant="neutral">Intermediary</Pill>}
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Code" name="code" required mono defaultValue={contact.code} />
                <Field label="Name" name="name" required defaultValue={contact.name} />
              </Row>
              <Row>
                <SelectField label="Kind" name="kind" required defaultValue={contact.kind}>
                  <option value="organization">Organization</option>
                  <option value="individual">Individual</option>
                </SelectField>
                <Field label="Email" name="email" type="email" defaultValue={contact.email ?? ""} />
              </Row>
              <Row>
                <Field label="Phone" name="phone" mono defaultValue={contact.phone ?? ""} />
                <Field label="Address" name="address" defaultValue={contact.address ?? ""} />
              </Row>
              <TextareaField label="Notes" name="notes" defaultValue={contact.notes ?? ""} />

              <div className="flex flex-col gap-1.5 pt-2">
                <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  Tags
                </span>
                <div className="flex gap-4 flex-wrap text-[13px]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="isClient" defaultChecked={contact.isClient} />
                    <span style={{ color: "var(--ink-2)" }}>Client</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="isVendor" defaultChecked={contact.isVendor} />
                    <span style={{ color: "var(--ink-2)" }}>Vendor</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="isEmployee" defaultChecked={contact.isEmployee} />
                    <span style={{ color: "var(--ink-2)" }}>Employee</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="isIntermediary"
                      defaultChecked={contact.isIntermediary}
                    />
                    <span style={{ color: "var(--ink-2)" }}>Intermediary</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="isActive" defaultChecked={contact.isActive} />
                    <span style={{ color: "var(--ink-2)" }}>Active</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3.5">
              <Button variant="primary" type="submit">
                Save changes
              </Button>
            </div>
          </Card>
        </form>

        <Card title={`Linked records (${links.length})`}>
          {linkLabels.length === 0 ? (
            <Empty
              title="No links"
              body="Link this contact to entities, bank accounts, invoices, etc."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Type</TH>
                  <TH>Reference</TH>
                  <TH>Role</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {linkLabels.map(({ link, label, href }) => (
                  <TR key={link.id}>
                    <TD style={{ color: "var(--ink-3)" }}>{REF_LABEL[link.refType]}</TD>
                    <TD>
                      {href ? (
                        <Link
                          href={href}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {link.role ?? "—"}
                    </TD>
                    <TD>
                      <form action={deleteLinkAction}>
                        <input type="hidden" name="id" value={link.id} />
                        <input type="hidden" name="contactId" value={contact.id} />
                        <Button variant="ghost" type="submit">
                          Remove
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={addLinkAction}>
          <input type="hidden" name="contactId" value={contact.id} />
          <Card title="Add link">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="Ref type" name="refType" required defaultValue="entity">
                  <option value="entity">Entity</option>
                  <option value="bank_account">Bank account</option>
                  <option value="invoice">Invoice</option>
                  <option value="bill">Bill</option>
                  <option value="asset">Asset</option>
                </SelectField>
                <Field
                  label="Ref id"
                  name="refId"
                  required
                  mono
                  placeholder="e-001 / ba-002 / i-018 / b-058 / as-001"
                />
              </Row>
              <Row>
                <Field label="Role" name="role" placeholder="Trustee, signer, advisor…" />
                <div />
              </Row>
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add link
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <CustomFields
          recordType="contact"
          recordId={contact.id}
          redirectPath={`/contacts/${contact.id}`}
        />

        <Attachments
          recordType="contact"
          recordId={contact.id}
          redirectPath={`/contacts/${contact.id}`}
        />

        <form action={deleteContactAction}>
          <input type="hidden" name="id" value={contact.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting a contact removes all its links. Prefer marking
                inactive for compliance trails.
              </span>
              <ConfirmButton
                label="Delete contact"
                title={`Delete contact ${contact.name}?`}
                message="This removes the contact and all of its links to entities, clients, vendors, and bank signers. Prefer marking inactive for a compliance trail."
                confirmText="Delete contact"
              />
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
