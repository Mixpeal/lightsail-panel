import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { safeExec } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAuth();

    const [hostname, uptime, memory, disk] = await Promise.all([
      safeExec("hostname", []).then((r) => r.stdout.trim()).catch(() => "unknown"),
      safeExec("uptime", ["-s"]).then((r) => {
        const bootTime = new Date(r.stdout.trim()).getTime();
        return Math.floor((Date.now() - bootTime) / 1000);
      }).catch(() => 0),
      safeExec("free", ["-b"]).then((r) => {
        const lines = r.stdout.split("\n");
        const memLine = lines.find((l) => l.startsWith("Mem:"));
        if (!memLine) return { total: 0, used: 0, percent: 0 };
        const parts = memLine.split(/\s+/);
        const total = parseInt(parts[1], 10);
        const used = parseInt(parts[2], 10);
        return { total, used, percent: total ? Math.round((used / total) * 100) : 0 };
      }).catch(() => ({ total: 0, used: 0, percent: 0 })),
      safeExec("df", ["-B1", "/"]).then((r) => {
        const lines = r.stdout.split("\n");
        if (lines.length < 2) return { total: 0, used: 0, percent: 0 };
        const parts = lines[1].split(/\s+/);
        const total = parseInt(parts[1], 10);
        const used = parseInt(parts[2], 10);
        return { total, used, percent: total ? Math.round((used / total) * 100) : 0 };
      }).catch(() => ({ total: 0, used: 0, percent: 0 })),
    ]);

    return NextResponse.json({ hostname, uptime, memory, disk });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
