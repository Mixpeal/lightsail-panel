/**
 * File-based audit logger.
 *
 * Logs security-relevant events to /var/log/lightsail-panel/audit.log.
 * Falls back to console.log in development.
 */

import { appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const LOG_DIR = "/var/log/lightsail-panel";
const LOG_FILE = `${LOG_DIR}/audit.log`;
const isDev = process.env.NODE_ENV !== "production";

let logDirChecked = false;

async function ensureLogDir() {
  if (logDirChecked || isDev) return;
  try {
    if (!existsSync(LOG_DIR)) {
      await mkdir(LOG_DIR, { recursive: true });
    }
    logDirChecked = true;
  } catch {
    // Falls back to console in production if dir creation fails
  }
}

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "service_start"
  | "service_stop"
  | "service_restart"
  | "env_read"
  | "env_write"
  | "env_reveal"
  | "rate_limited"
  | "blocked_ip";

export async function audit(
  action: AuditAction,
  ip: string,
  target?: string,
  details?: string,
) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${ip}] [${action}] [${target || "-"}] ${details || ""}\n`;

  if (isDev) {
    console.log(`AUDIT: ${line.trim()}`);
    return;
  }

  try {
    await ensureLogDir();
    await appendFile(LOG_FILE, line);
  } catch {
    console.error(`Failed to write audit log: ${line.trim()}`);
  }
}
