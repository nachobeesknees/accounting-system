import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { EntityScopePicker } from "./EntityScopePicker";
import { SidebarToggle } from "./SidebarToggle";
import { setEntityScope } from "@/lib/entity-scope";
import type { SessionUser } from "@/lib/types";

type EntityOption = { id: string; code: string; name: string };

async function changeEntityScope(entityId: string | null) {
  "use server";
  await setEntityScope(entityId);
}

export function Topbar({
  user,
  breadcrumb,
  entities,
  currentEntityId,
}: {
  user: SessionUser;
  breadcrumb?: string;
  entities: EntityOption[];
  currentEntityId: string | null;
}) {
  return (
    <div
      className="topbar flex items-center justify-between px-3.5 h-full"
      style={{
        background: "var(--paper)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <SidebarToggle />
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md w-[22px] h-[22px] font-bold text-[12px] shrink-0"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          T
        </Link>
        <div className="hidden sm:flex items-center gap-1.5 text-[12.5px] min-w-0" style={{ color: "var(--ink-3)" }}>
          <Link href="/" style={{ color: "var(--ink-3)", textDecoration: "none" }}>
            Thistlewood &amp; Associates
          </Link>
          {breadcrumb && (
            <>
              <span style={{ color: "var(--ink-5)" }}>/</span>
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>{breadcrumb}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <EntityScopePicker
          entities={entities}
          current={currentEntityId}
          onChange={changeEntityScope}
        />
        <ThemeToggle />
        <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
          <span
            className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[10.5px] font-semibold"
            style={{ background: "var(--p-formation-bg)", color: "var(--p-formation-fg)" }}
          >
            {user.fullName.charAt(0)}
          </span>
          <span className="hidden md:inline">{user.fullName}</span>
        </span>
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className="signout-btn text-[12px] px-2 py-1 rounded-md cursor-pointer"
            style={{ color: "var(--ink-3)", background: "transparent", border: "1px solid transparent" }}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
