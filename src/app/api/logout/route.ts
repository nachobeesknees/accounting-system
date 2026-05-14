import { NextResponse } from "next/server";
import { auth, signOut } from "@/auth";
import { logAuditEvent } from "@/lib/audit";

async function handle(request: Request) {
  // Capture the session before signing out so we can attribute the event.
  const session = await auth();
  const sessionUser = session?.user
    ? {
        userId: session.user.id ?? "",
        email: session.user.email ?? "",
        fullName: session.user.name ?? "",
        role: session.user.role ?? "viewer",
        isSuperuser: !!session.user.isSuperuser,
      }
    : null;
  if (sessionUser) {
    await logAuditEvent(sessionUser, { action: "user.logout", resourceType: "user" });
  }
  await signOut({ redirect: false });
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}

export const POST = handle;
export const GET = handle;
