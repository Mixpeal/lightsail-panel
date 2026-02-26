"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ServiceCard } from "@/components/ServiceCard";
import { SystemBar } from "@/components/SystemBar";
import type { ServiceStatus } from "@/lib/types";

function getCsrfToken(): string {
  const match = document.cookie.match(/lsp_csrf=([^;]+)/);
  return match ? match[1] : "";
}

export default function DashboardPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState<string | null>(null);
  const router = useRouter();

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/services");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) {
        setServices(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  const handleRestart = async (name: string) => {
    setRestarting(name);
    try {
      await fetch(`/api/services/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ action: "restart" }),
      });
      // Wait a moment for the service to start back up
      await new Promise((r) => setTimeout(r, 2000));
      await fetchServices();
    } catch {
      // ignore
    } finally {
      setRestarting(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": getCsrfToken() },
    });
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-background-medium">
      <header className="bg-background border-b border-border-main">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">Service Panel</h1>
          <button
            onClick={handleLogout}
            className="text-xs text-foreground-medium hover:text-foreground transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <SystemBar />

        {loading ? (
          <div className="text-foreground-medium text-sm">Loading services…</div>
        ) : services.length === 0 ? (
          <div className="text-center py-16 text-foreground-medium">
            <p className="text-lg font-medium mb-2">No services discovered</p>
            <p className="text-sm">
              Services are auto-discovered from /etc/systemd/system/*.service files
              that have a WorkingDirectory set.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <ServiceCard
                key={service.name}
                service={service}
                onRestart={handleRestart}
                restarting={restarting === service.name}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
