"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { approveVendor, rejectVendor } from "@/lib/mutations";

/**
 * Server action wired to the Approve / Reject buttons on the
 * vendor-approval queue. Decides which path to take based on the
 * submit button's `action` value, then revalidates everywhere a
 * vendor count or status pill shows up.
 */
export async function decideVendorApprovalAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "vendor.approve");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        "/vendors/pending?error=" +
          encodeURIComponent("You don't have permission to approve vendors."),
      );
    }
    throw err;
  }

  const vendorId = String(formData.get("vendorId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!vendorId) {
    redirect(
      "/vendors/pending?error=" + encodeURIComponent("Vendor id is required."),
    );
  }
  if (decision !== "approve" && decision !== "reject") {
    redirect(
      "/vendors/pending?error=" +
        encodeURIComponent("Decision must be approve or reject."),
    );
  }

  try {
    if (decision === "approve") {
      await approveVendor(user, vendorId, notes);
    } else {
      await rejectVendor(user, vendorId, notes);
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update vendor.";
    redirect("/vendors/pending?error=" + encodeURIComponent(msg));
  }

  // Anywhere a vendor count, list, or pending pill shows up.
  revalidatePath("/vendors");
  revalidatePath("/vendors/pending");
  revalidatePath("/bills");
  revalidatePath("/bills/pay-run");
  revalidatePath("/");
  redirect(`/vendors/pending?${decision}d=${vendorId}`);
}
