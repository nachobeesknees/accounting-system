import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { IconClock } from "@/components/ui/Icon";
import { getSessionUser } from "@/lib/session";
import {
  getPendingApprovalsForUser,
  type ApprovalGroup,
} from "@/lib/data";
import { formatMoney } from "@/lib/money";

/**
 * Unified approvals inbox — a single "needs my action" queue aggregating
 * every pending approval the current user is empowered to act on. Rows link
 * out to each item's detail page where the existing approve/reject controls
 * live. Permissions and segregation-of-duties are applied server-side in
 * getPendingApprovalsForUser so the inbox never implies the viewer can act
 * on an item the mutation would reject.
 */
export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const groups = await getPendingApprovalsForUser(user);

  const totalActionable = groups.reduce((s, g) => s + g.actionableCount, 0);
  const totalRows = groups.reduce((s, g) => s + g.items.length, 0);
  // Only render groups the viewer holds permission for (already filtered)
  // AND that have at least one row.
  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Approvals"
        meta={
          totalActionable === 0
            ? totalRows === 0
              ? "Nothing awaiting your action"
              : `${totalRows} awaiting · none actionable by you`
            : `${totalActionable} awaiting your action`
        }
      />

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        {visibleGroups.length === 0 ? (
          <Card title="Inbox">
            <Empty
              icon={<IconClock size={20} />}
              title="You're all caught up"
              body="There's nothing waiting on your approval right now. Items you're empowered to approve — invoices, bills, vendors, journal entries, payment runs, and distributions — will appear here."
            />
          </Card>
        ) : (
          visibleGroups.map((g) => <ApprovalGroupCard key={g.type} group={g} />)
        )}
      </div>
    </>
  );
}

function ApprovalGroupCard({ group }: { group: ApprovalGroup }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span>{group.label}</span>
          <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
            · {group.items.length} awaiting
          </span>
        </span>
      }
      actions={
        group.actionableCount > 0 ? (
          <Pill variant="pending">{group.actionableCount} actionable</Pill>
        ) : (
          <Pill variant="review">Awaiting others</Pill>
        )
      }
    >
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Reference</TH>
            <TH>Details</TH>
            <TH>Stage</TH>
            <TH num>Amount</TH>
            <TH>{""}</TH>
          </TR>
        </THead>
        <TBody>
          {group.items.map((it) => (
            <TR key={it.id} href={it.href}>
              <TD mono>
                <Link
                  href={it.href}
                  style={{ color: "var(--ink)", textDecoration: "none" }}
                >
                  {it.reference}
                </Link>
              </TD>
              <TD>{it.subtitle}</TD>
              <TD>
                <span style={{ color: "var(--ink-2)" }}>{it.stage}</span>
                {!it.actionable && it.blockedReason && (
                  <span
                    className="block text-[11px]"
                    style={{ color: "var(--ink-4)", marginTop: 2 }}
                  >
                    {it.blockedReason}
                  </span>
                )}
              </TD>
              <TD num>
                {it.amount == null
                  ? "—"
                  : formatMoney(it.amount, "USD", {
                      paren: true,
                      compact: true,
                      hideCurrency: true,
                    })}
              </TD>
              <TD>
                {it.actionable ? (
                  <Link
                    href={it.href}
                    style={{ color: "var(--ink-3)", textDecoration: "none" }}
                  >
                    Review →
                  </Link>
                ) : (
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--ink-4)" }}
                    title={it.blockedReason ?? "You cannot self-approve"}
                  >
                    You cannot self-approve
                  </span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
