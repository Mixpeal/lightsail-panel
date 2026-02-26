import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError, getClientIP } from "@/lib/auth";
import { getServiceStatus, readEnvFile } from "@/lib/services";
import { validateServiceName } from "@/lib/shell";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireAuth();
    const { name } = await params;

    if (!validateServiceName(name)) {
      return NextResponse.json({ error: "Invalid service name" }, { status: 400 });
    }

    const body = await req.json();
    const key = body?.key;

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Key required" }, { status: 400 });
    }

    const service = await getServiceStatus(name);
    if (!service?.envFile) {
      return NextResponse.json({ error: "Service or env file not found" }, { status: 404 });
    }

    const ip = await getClientIP();
    await audit("env_reveal", ip, name, key);

    const entries = await readEnvFile(service.envFile);
    const entry = entries.find((e) => e.key === key);

    if (!entry) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ value: entry.value });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
