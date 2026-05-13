import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, TextareaField } from "@/components/ui/Field";
import { getSessionUser } from "@/lib/session";
import { createCustomer } from "@/lib/mutations";

async function createCustomerAction(formData: FormData): Promise<void> {
  "use server";

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const billingAddress = String(formData.get("billingAddress") ?? "").trim();
  const paymentTermsRaw = String(formData.get("paymentTerms") ?? "30").trim();

  if (!code) {
    redirect(`/customers/new?error=${encodeURIComponent("Code is required.")}`);
  }
  if (!name) {
    redirect(`/customers/new?error=${encodeURIComponent("Name is required.")}`);
  }

  const paymentTerms = Number.parseInt(paymentTermsRaw, 10);
  if (!Number.isFinite(paymentTerms) || paymentTerms < 0) {
    redirect(
      `/customers/new?error=${encodeURIComponent("Payment terms must be a non-negative integer.")}`,
    );
  }

  let created: { id: string } | undefined;
  try {
    created = await createCustomer(user, {
      code,
      name,
      email: email || null,
      phone: phone || null,
      billingAddress: billingAddress || null,
      paymentTerms,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create customer.";
    redirect(`/customers/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <>
      <Breadcrumbs items={[{ label: "Clients", href: "/customers" }, { label: "New" }]} />
      <PageHeader
        title="New client"
        actions={
          <Link
            href="/customers"
            className="px-3 py-1.5 text-[13px] rounded-md"
            style={{
              border: "1px solid var(--line-2)",
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
        }
      />
      <form action={createCustomerAction}>
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

          <Card title="Client details">
            <div className="p-3.5 flex flex-col gap-3">
              <Row>
                <Field
                  label="Code"
                  name="code"
                  required
                  mono
                  placeholder="CUST-006"
                />
                <Field
                  label="Name"
                  name="name"
                  required
                  placeholder="Acme Industries"
                />
              </Row>
              <Row>
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="ap@example.com"
                />
                <Field label="Phone" name="phone" placeholder="(555) 555-0123" />
              </Row>
              <TextareaField
                label="Billing address"
                name="billingAddress"
                placeholder="Street, City, State ZIP"
              />
              <Row>
                <Field
                  label="Net (days)"
                  name="paymentTerms"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={30}
                />
                <div />
              </Row>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Link
              href="/customers"
              className="px-3 py-1.5 text-[13px] rounded-md"
              style={{
                border: "1px solid var(--line-2)",
                color: "var(--ink-2)",
                textDecoration: "none",
              }}
            >
              Cancel
            </Link>
            <Button variant="primary" type="submit">
              Create client
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
