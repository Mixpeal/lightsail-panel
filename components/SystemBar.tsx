"use client";

import { useState, useEffect } from "react";

interface SystemInfo {
  hostname: string;
  uptime: number;
  memory: { total: number; used: number; percent: number };
  disk: { total: number; used: number; percent: number };
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function BarMeter({ percent, warn }: { percent: number; warn?: number }) {
  const color =
    percent >= (warn || 90)
      ? "bg-red-500"
      : percent >= 70
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="w-20 h-1.5 rounded-full bg-background-accent overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function SystemBar() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch("/api/system");
        if (res.ok) setInfo(await res.json());
      } catch {
        // ignore
      }
    };
    fetchInfo();
    const interval = setInterval(fetchInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!info) {
    return (
      <div className="flex items-center gap-6 px-4 py-2 rounded-xl bg-background-medium text-xs text-foreground-low">
        Loading system info…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl bg-background-medium text-xs">
      <span className="font-medium text-foreground">{info.hostname}</span>
      <span className="text-foreground-medium">Up {formatUptime(info.uptime)}</span>

      <div className="flex items-center gap-2">
        <span className="text-foreground-medium">RAM</span>
        <BarMeter percent={info.memory.percent} warn={85} />
        <span className="text-foreground-low">
          {formatSize(info.memory.used)} / {formatSize(info.memory.total)} ({info.memory.percent}%)
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-foreground-medium">Disk</span>
        <BarMeter percent={info.disk.percent} />
        <span className="text-foreground-low">
          {formatSize(info.disk.used)} / {formatSize(info.disk.total)} ({info.disk.percent}%)
        </span>
      </div>
    </div>
  );
}
