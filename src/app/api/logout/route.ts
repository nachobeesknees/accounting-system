import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST(request: Request) {
  await clearSession();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}

export async function GET(request: Request) {
  await clearSession();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}
