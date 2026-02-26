/**
 * Systemd service auto-discovery and management.
 *
 * Discovers user-created services from /etc/systemd/system/*.service
 * by parsing unit files for WorkingDirectory, EnvironmentFile, etc.
 * Enriches with live status data via `systemctl show`.
 */

import { readdir, readFile } from "fs/promises";
import { safeExec, systemctl, validateServiceName } from "./shell";
import type { ServiceInfo, ServiceStatus } from "./types";

export type { ServiceInfo, ServiceStatus };

const SYSTEMD_DIR = "/etc/systemd/system";

// Services to exclude from discovery
const EXCLUDED_SERVICES = new Set([
  "lightsail-panel",
  "caddy",
]);

/**
 * Parse a systemd unit file and extract key properties.
 */
function parseUnitFile(content: string): Partial<ServiceInfo> {
  const result: Partial<ServiceInfo> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Description=")) {
      result.description = trimmed.slice("Description=".length);
    } else if (trimmed.startsWith("WorkingDirectory=")) {
      result.workingDir = trimmed.slice("WorkingDirectory=".length);
    } else if (trimmed.startsWith("EnvironmentFile=")) {
      result.envFile = trimmed.slice("EnvironmentFile=".length);
    } else if (trimmed.startsWith("ExecStart=")) {
      result.execStart = trimmed.slice("ExecStart=".length);
    }
  }

  return result;
}

/**
 * Discover all user-created systemd services.
 */
export async function discoverServices(): Promise<ServiceInfo[]> {
  try {
    const files = await readdir(SYSTEMD_DIR);
    const services: ServiceInfo[] = [];

    for (const file of files) {
      if (!file.endsWith(".service")) continue;

      const name = file.replace(".service", "");
      if (EXCLUDED_SERVICES.has(name)) continue;
      if (!validateServiceName(name)) continue;

      try {
        const content = await readFile(`${SYSTEMD_DIR}/${file}`, "utf-8");
        const parsed = parseUnitFile(content);

        // Only include services with a WorkingDirectory (user-created app services)
        if (!parsed.workingDir) continue;

        services.push({
          name,
          unit: file,
          description: parsed.description || name,
          workingDir: parsed.workingDir,
          envFile: parsed.envFile || null,
          execStart: parsed.execStart || null,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return services.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // If we can't read the systemd dir, return empty (e.g., in dev on macOS)
    return [];
  }
}

/**
 * Get live status for a specific service.
 */
export async function getServiceStatus(serviceName: string): Promise<ServiceStatus | null> {
  const services = await discoverServices();
  const service = services.find((s) => s.name === serviceName);
  if (!service) return null;

  return enrichWithStatus(service);
}

/**
 * Get live status for all discovered services.
 */
export async function getAllServiceStatuses(): Promise<ServiceStatus[]> {
  const services = await discoverServices();
  return Promise.all(services.map(enrichWithStatus));
}

/**
 * Enrich a ServiceInfo with live status data from systemctl show.
 */
async function enrichWithStatus(service: ServiceInfo): Promise<ServiceStatus> {
  try {
    const { stdout } = await safeExec("sudo", [
      "systemctl", "show", service.unit,
      "--property=ActiveState,SubState,MainPID,MemoryCurrent,ActiveEnterTimestamp",
    ]);

    const props = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        props.set(line.slice(0, eq), line.slice(eq + 1));
      }
    }

    const startedAt = props.get("ActiveEnterTimestamp") || null;
    let uptimeSeconds: number | null = null;
    if (startedAt && startedAt !== "") {
      const startTime = new Date(startedAt).getTime();
      if (!isNaN(startTime)) {
        uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
      }
    }

    const memStr = props.get("MemoryCurrent");
    const memoryBytes = memStr && memStr !== "[not set]" ? parseInt(memStr, 10) || null : null;

    return {
      ...service,
      active: props.get("ActiveState") || "unknown",
      sub: props.get("SubState") || "unknown",
      pid: parseInt(props.get("MainPID") || "0", 10) || null,
      memoryBytes,
      uptimeSeconds,
      startedAt,
    };
  } catch {
    return {
      ...service,
      active: "unknown",
      sub: "unknown",
      pid: null,
      memoryBytes: null,
      uptimeSeconds: null,
      startedAt: null,
    };
  }
}

/**
 * Perform an action on a service (start, stop, restart).
 */
export async function serviceAction(
  serviceName: string,
  action: "start" | "stop" | "restart",
): Promise<void> {
  await systemctl(action, serviceName);
}

/**
 * Read environment variables from a service's .env file.
 */
export async function readEnvFile(envPath: string): Promise<{ key: string; value: string }[]> {
  try {
    const { stdout } = await safeExec("sudo", ["cat", envPath]);
    const entries: { key: string; value: string }[] = [];

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        entries.push({
          key: trimmed.slice(0, eq),
          value: trimmed.slice(eq + 1),
        });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Write environment variables to a service's .env file.
 * Creates a backup before writing.
 */
export async function writeEnvFile(
  envPath: string,
  entries: { key: string; value: string }[],
): Promise<void> {
  // Create backup
  const timestamp = Date.now();
  await safeExec("sudo", ["cp", envPath, `${envPath}.bak.${timestamp}`]);

  // Build new content
  const content = entries.map((e) => `${e.key}=${e.value}`).join("\n") + "\n";

  // Write via stdin to sudo tee (using execFile with process stdin)
  const { execFile: execFileCb } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    const child = execFileCb("sudo", ["tee", envPath], { timeout: 5_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
    child.stdin?.write(content);
    child.stdin?.end();
  });
}
