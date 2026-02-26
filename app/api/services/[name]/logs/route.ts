import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { validateServiceName } from "@/lib/shell";
import { journalctl } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireAuth();
    const { name } = await params;

    if (!validateServiceName(name)) {
      return NextResponse.json({ error: "Invalid service name" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const lines = Math.min(parseInt(searchParams.get("lines") || "100", 10), 500);
    const since = searchParams.get("since") || undefined;

    const output = await journalctl(name, { lines, since });
    return NextResponse.json({ logs: output });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
