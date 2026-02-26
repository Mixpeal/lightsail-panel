import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireCSRF, AuthError } from "@/lib/auth";
import { getServiceStatus, serviceAction } from "@/lib/services";
import { validateServiceName, validateAction } from "@/lib/shell";
import { audit } from "@/lib/audit";
import { getClientIP } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireAuth();
    const { name } = await params;

    if (!validateServiceName(name)) {
      return NextResponse.json({ error: "Invalid service name" }, { status: 400 });
    }

    const status = await getServiceStatus(name);
    if (!status) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireAuth();
    await requireCSRF();
    const { name } = await params;

    if (!validateServiceName(name)) {
      return NextResponse.json({ error: "Invalid service name" }, { status: 400 });
    }

    const body = await req.json();
    const action = body?.action;

    if (!action || !["start", "stop", "restart"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const ip = await getClientIP();
    await audit(`service_${action}` as "service_start" | "service_stop" | "service_restart", ip, name);

    await serviceAction(name, action);

    // Return updated status
    const status = await getServiceStatus(name);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
