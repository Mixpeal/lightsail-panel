import { NextResponse } from "next/server";
import { requireAuth, requireCSRF, logout, AuthError } from "@/lib/auth";

export async function POST() {
  try {
    await requireAuth();
    await requireCSRF();
    await logout();
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
