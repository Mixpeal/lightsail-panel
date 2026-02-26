import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireCSRF, verifyPassword, AuthError, getClientIP } from "@/lib/auth";
import { getServiceStatus, readEnvFile, writeEnvFile } from "@/lib/services";
import { validateServiceName } from "@/lib/shell";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const SENSITIVE_PATTERNS = /key|secret|password|token|cert|credential/i;

function maskEntries(entries: { key: string; value: string }[]) {
  return entries.map((e) => ({
    key: e.key,
    value: SENSITIVE_PATTERNS.test(e.key) ? "••••••••" : e.value,
    sensitive: SENSITIVE_PATTERNS.test(e.key),
  }));
}

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

    const service = await getServiceStatus(name);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    if (!service.envFile) {
      return NextResponse.json({ error: "No env file configured" }, { status: 404 });
    }

    const ip = await getClientIP();
    await audit("env_read", ip, name);

    const entries = await readEnvFile(service.envFile);
    return NextResponse.json({ entries: maskEntries(entries), path: service.envFile });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
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
    const { entries, password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password confirmation required" }, { status: 400 });
    }

    const passwordValid = await verifyPassword(password);
    if (!passwordValid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 403 });
    }

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: "Invalid entries" }, { status: 400 });
    }

    const service = await getServiceStatus(name);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    if (!service.envFile) {
      return NextResponse.json({ error: "No env file configured" }, { status: 404 });
    }

    // Validate entries
    for (const entry of entries) {
      if (!entry.key || typeof entry.key !== "string" || typeof entry.value !== "string") {
        return NextResponse.json({ error: "Invalid entry format" }, { status: 400 });
      }
    }

    const ip = await getClientIP();
    await audit("env_write", ip, name, `${entries.length} entries`);

    await writeEnvFile(service.envFile, entries);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to write env file" }, { status: 500 });
  }
}
