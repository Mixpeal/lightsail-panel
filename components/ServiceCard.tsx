"use client";

import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import type { ServiceStatus } from "@/lib/types";
import { formatUptime, formatBytes } from "@/lib/types";

export function ServiceCard({
  service,
  onRestart,
  restarting,
}: {
  service: ServiceStatus;
  onRestart: (name: string) => void;
  restarting: boolean;
}) {
  return (
    <div className="border border-border-main rounded-xl bg-background p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <Link
          href={`/services/${service.name}`}
          className="text-foreground font-semibold hover:text-primary transition-colors"
        >
          {service.name}
        </Link>
        <StatusBadge active={service.active} sub={service.sub} />
      </div>

      <p className="text-foreground-medium text-sm mb-4 line-clamp-1">
        {service.description}
      </p>

      <div className="flex items-center gap-4 text-xs text-foreground-low mb-4">
        <span>Uptime: {formatUptime(service.uptimeSeconds)}</span>
        <span>Mem: {formatBytes(service.memoryBytes)}</span>
        {service.pid && <span>PID: {service.pid}</span>}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/services/${service.name}`}
          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Details →
        </Link>
        <div className="flex-1" />
        <button
          onClick={() => onRestart(service.name)}
          disabled={restarting}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {restarting ? "Restarting…" : "Restart"}
        </button>
      </div>
    </div>
  );
}
