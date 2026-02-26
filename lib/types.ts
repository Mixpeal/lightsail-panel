export interface ServiceInfo {
  name: string;
  unit: string;
  description: string;
  workingDir: string | null;
  envFile: string | null;
  execStart: string | null;
}

export interface ServiceStatus extends ServiceInfo {
  active: "active" | "inactive" | "failed" | "activating" | "deactivating" | string;
  sub: string;
  pid: number | null;
  memoryBytes: number | null;
  uptimeSeconds: number | null;
  startedAt: string | null;
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
