import { redirect } from "next/navigation";
import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { IconFile } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getVendorsNeedingApproval } from "@/lib/data";
import { formatDate } from "@/lib/format";

import { decideVendorApprovalAction } from "./actions";

/**
 * Vendor approval queue. Lists every vendor whose `approval_status` is
 * not "approved" (so both pending OCR auto-creates and previously
 * rejected rows show up). A manager / admin reviews each row and either
 * approves it (bills against it can then post) or rejects it (the row
 * remains for history but is blocked from further postings).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    approved?: string;
    rejected?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const canApprove = hasPermission(user, "vendor.approve");
  const vendors = await getVendorsNeedingApproval();

  return (
    <>
      <PageHeader
        title="Vendor approvals"
        meta={`${vendors.length} awaiting review`}
      />

      {params.error && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {params.error}
        </div>
      )}
      {(params.approved || params.rejected) && (
        <div
          className="px-6 py-1.5 text-[12px]"
          style={{
            background: "var(--p-active-bg)",
            color: "var(--p-active-fg)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {params.approved ? "Vendor approved." : "Vendor rejected."}
        </div>
      )}

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3">
        {!canApprove && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-pending-bg)",
              color: "var(--p-pending-fg)",
              border: "1px solid var(--p-pending-fg)",
            }}
          >
            You can view this queue, but only managers and above can approve
            or reject vendors. Bills against these vendors stay locked from
            approval until someone with permission acts on them.
          </div>
        )}

        <Card title="Vendors awaiting review">
          {vendors.length === 0 ? (
            <Empty
              icon={<IconFile size={20} />}
              title="No vendors to review"
              body="OCR-created vendors land here for approval. New ones will appear as you upload bill documents."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  {canApprove && <TH>Action</TH>}
                </TR>
              </THead>
              <TBody>
                {vendors.map((v) => {
                  const isRejected = v.approvalStatus === "rejected";
                  return (
                    <TR key={v.id} hover>
                      <TD mono>
                        <Link
                          href={`/vendors/${v.id}`}
                          style={{
                            color: "var(--ink)",
                            textDecoration: "none",
                          }}
                        >
                          {v.code}
                        </Link>
                      </TD>
                      <TD wrap>{v.name}</TD>
                      <TD>
                        <Pill variant={isRejected ? "review" : "pending"}>
                          {isRejected ? "Rejected" : "Pending"}
                        </Pill>
                      </TD>
                      <TD>{v.approvedAt ? formatDate(v.approvedAt.slice(0, 10)) : "—"}</TD>
                      {canApprove && (
                        <TD>
                          <form
                            action={decideVendorApprovalAction}
                            className="flex items-center gap-2"
                          >
                            <input type="hidden" name="vendorId" value={v.id} />
                            <input
                              type="text"
                              name="notes"
                              placeholder="Optional notes"
                              className="px-2 py-1 text-[12px] rounded-md outline-none"
                              style={{
                                background: "var(--paper)",
                                border: "1px solid var(--line-2)",
                                color: "var(--ink)",
                                width: 200,
                              }}
                            />
                            <button
                              type="submit"
                              name="decision"
                              value="approve"
                              className="px-2.5 py-1 rounded-md text-[12px]"
                              style={{
                                background: "var(--ink)",
                                color: "var(--paper)",
                                border: "1px solid var(--ink)",
                                cursor: "pointer",
                              }}
                            >
                              Approve
                            </button>
                            <button
                              type="submit"
                              name="decision"
                              value="reject"
                              className="px-2.5 py-1 rounded-md text-[12px]"
                              style={{
                                background: "transparent",
                                color: "var(--p-review-fg)",
                                border: "1px solid var(--p-review-fg)",
                                cursor: "pointer",
                              }}
                            >
                              Reject
                            </button>
                          </form>
                        </TD>
                      )}
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
