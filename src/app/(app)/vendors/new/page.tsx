import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Section } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { getAccounts } from "@/lib/data";
import { createVendor } from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const accounts = await getAccounts();
  const expenseAccounts = accounts
    .filter((a) => a.accountType === "expense" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));

  async function createVendorAction(formData: FormData) {
    "use server";

    const user = await getSessionUser();
    if (!user) redirect("/login");

    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const paymentTermsRaw = String(formData.get("paymentTerms") ?? "30").trim();
    const defaultExpenseAccountId = String(
      formData.get("defaultExpenseAccountId") ?? "",
    ).trim();
    const invoiceNumberPrefix = String(
      formData.get("invoiceNumberPrefix") ?? "",
    ).trim();
    const invoiceNumberPattern = String(
      formData.get("invoiceNumberPattern") ?? "",
    ).trim();
    const invoiceNumberLastUsed = String(
      formData.get("invoiceNumberLastUsed") ?? "",
    ).trim();

    if (!code) {
      redirect("/vendors/new?error=" + encodeURIComponent("Code is required."));
    }
    if (!name) {
      redirect("/vendors/new?error=" + encodeURIComponent("Name is required."));
    }
    const paymentTerms = parseInt(paymentTermsRaw, 10);
    if (!Number.isFinite(paymentTerms) || paymentTerms < 0) {
      redirect(
        "/vendors/new?error=" + encodeURIComponent("Payment terms must be ≥ 0."),
      );
    }

    try {
      const created = await createVendor(user, {
        code,
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        paymentTerms,
        defaultExpenseAccountId: defaultExpenseAccountId || null,
        invoiceNumberPrefix: invoiceNumberPrefix || null,
        invoiceNumberPattern: invoiceNumberPattern || null,
        invoiceNumberLastUsed: invoiceNumberLastUsed || null,
      });
      revalidatePath("/vendors");
      revalidatePath("/");
      redirect(`/vendors/${created.id}`);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const msg = err instanceof Error ? err.message : "Failed to create vendor.";
      redirect("/vendors/new?error=" + encodeURIComponent(msg));
    }
  }

  return (
    <>
      <PageHeader
        title="New vendor"
        meta="Vendors / New"
        actions={
          <ButtonLink href="/vendors" variant="secondary">
            Cancel
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

        <form action={createVendorAction} className="flex flex-col gap-3.5">
          <Section title="Identity">
            <Row>
              <Field
                label="Code"
                name="code"
                required
                mono
                placeholder="VEND-006"
              />
              <Field label="Name" name="name" required placeholder="Acme Inc." />
            </Row>
            <Row>
              <Field
                label="Email"
                name="email"
                type="email"
                placeholder="billing@vendor.com"
              />
              <Field
                label="Phone"
                name="phone"
                placeholder="+1 555 555 0123"
              />
            </Row>
            <TextareaField
              label="Address"
              name="address"
              placeholder="Street, City, State ZIP"
            />
          </Section>

          <Section title="Billing defaults">
            <Row>
              <Field
                label="Net (days)"
                name="paymentTerms"
                type="number"
                min={0}
                step={1}
                defaultValue={30}
                required
                mono
              />
              <SelectField
                label="Default expense account"
                name="defaultExpenseAccountId"
                defaultValue=""
              >
                <option value="">— None —</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </SelectField>
            </Row>
          </Section>

          <Section title="Invoice numbering rule (optional)">
            <Row>
              <Field
                label="Prefix"
                name="invoiceNumberPrefix"
                placeholder="INV-"
                mono
                help="Informational only — drives the placeholder shown on bill entry."
              />
              <Field
                label="Pattern"
                name="invoiceNumberPattern"
                placeholder="INV-YYYY-####"
                mono
                help="Placeholders: YYYY, YY, MM, DD, ####. Used when no last-used value exists."
              />
            </Row>
            <Row>
              <Field
                label="Last used"
                name="invoiceNumberLastUsed"
                placeholder="INV-2025-0042"
                mono
                help="Next suggestion increments the trailing digits of this value."
              />
              <div />
            </Row>
          </Section>

          <div className="flex gap-2 items-center justify-end">
            <ButtonLink variant="ghost" href="/vendors">
              Cancel
            </ButtonLink>
            <Button variant="primary" type="submit">
              Create vendor
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
