"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { EnvEditor } from "@/components/EnvEditor";
import { LogViewer } from "@/components/LogViewer";
import type { ServiceStatus } from "@/lib/types";
import { formatUptime, formatBytes } from "@/lib/types";

function getCsrfToken(): string {
  const match = document.cookie.match(/lsp_csrf=([^;]+)/);
  return match ? match[1] : "";
}

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const [service, setService] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const router = useRouter();

  const fetchService = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/${name}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        setService(null);
      } else if (res.ok) {
        setService(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [name, router]);

  useEffect(() => {
    fetchService();
    const interval = setInterval(fetchService, 10000);
    return () => clearInterval(interval);
  }, [fetchService]);

  const handleAction = async (action: "start" | "stop" | "restart") => {
    setActionLoading(action);
    try {
      await fetch(`/api/services/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ action }),
      });
      await new Promise((r) => setTimeout(r, 2000));
      await fetchService();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-medium flex items-center justify-center">
        <div className="text-foreground-medium">Loading…</div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-background-medium flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground-medium text-lg mb-4">Service not found</p>
          <Link href="/" className="text-primary hover:text-primary/80 text-sm">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-medium">
      <header className="bg-background border-b border-border-main">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="text-xs text-foreground-medium hover:text-foreground transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Service header */}
        <div className="bg-background border border-border-main rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">{service.name}</h1>
              <p className="text-foreground-medium text-sm mt-1">{service.description}</p>
            </div>
            <StatusBadge active={service.active} sub={service.sub} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <div className="text-foreground-low text-xs mb-1">Uptime</div>
              <div className="text-foreground font-medium">{formatUptime(service.uptimeSeconds)}</div>
            </div>
            <div>
              <div className="text-foreground-low text-xs mb-1">Memory</div>
              <div className="text-foreground font-medium">{formatBytes(service.memoryBytes)}</div>
            </div>
            <div>
              <div className="text-foreground-low text-xs mb-1">PID</div>
              <div className="text-foreground font-medium">{service.pid || "-"}</div>
            </div>
            <div>
              <div className="text-foreground-low text-xs mb-1">Started</div>
              <div className="text-foreground font-medium text-xs">
                {service.startedAt || "-"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {service.active !== "active" && (
              <button
                onClick={() => handleAction("start")}
                disabled={!!actionLoading}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "start" ? "Starting…" : "Start"}
              </button>
            )}
            <button
              onClick={() => handleAction("restart")}
              disabled={!!actionLoading}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {actionLoading === "restart" ? "Restarting…" : "Restart"}
            </button>
            {service.active === "active" && (
              <button
                onClick={() => handleAction("stop")}
                disabled={!!actionLoading}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "stop" ? "Stopping…" : "Stop"}
              </button>
            )}
          </div>
        </div>

        {/* Working directory & exec info */}
        <div className="bg-background border border-border-main rounded-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-foreground-low text-xs mb-1">Working Directory</div>
              <div className="text-foreground font-mono text-xs">{service.workingDir || "-"}</div>
            </div>
            <div>
              <div className="text-foreground-low text-xs mb-1">ExecStart</div>
              <div className="text-foreground font-mono text-xs truncate">{service.execStart || "-"}</div>
            </div>
          </div>
        </div>

        {/* Environment editor */}
        {service.envFile && <EnvEditor serviceName={name} />}

        {/* Logs */}
        <LogViewer serviceName={name} />
      </main>
    </div>
  );
}
