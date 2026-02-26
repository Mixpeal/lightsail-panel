import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { getAllServiceStatuses } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAuth();
    const services = await getAllServiceStatuses();
    return NextResponse.json(services);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
