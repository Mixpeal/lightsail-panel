/**
 * Safe shell execution wrapper.
 *
 * - Uses execFile (not exec) to prevent shell injection
 * - Only allowlisted commands can be executed
 * - Arguments are validated before execution
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFileCb);

const ALLOWED_COMMANDS = new Set([
  "systemctl",
  "journalctl",
  "sudo",
  "hostname",
  "uptime",
  "free",
  "df",
  "cat",
  "tee",
  "cp",
  "ls",
]);

const SERVICE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const SYSTEMCTL_ACTIONS = new Set(["start", "stop", "restart", "status", "show", "is-active", "list-units"]);

export class ShellError extends Error {
  constructor(
    message: string,
    public readonly code: number | null,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "ShellError";
  }
}

/** Validate that a service name is safe for use in commands */
export function validateServiceName(name: string): boolean {
  return SERVICE_NAME_RE.test(name) && name.length <= 128;
}

/** Validate a systemctl action */
export function validateAction(action: string): boolean {
  return SYSTEMCTL_ACTIONS.has(action);
}

/**
 * Execute a command safely.
 * Only allowlisted commands are permitted. Arguments are passed as an array
 * to execFile (no shell interpolation).
 */
export async function safeExec(
  command: string,
  args: string[],
  options?: { timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  // When using sudo, validate the actual command being run
  const actualCommand = command === "sudo" ? args[0] : command;
  if (!actualCommand || !ALLOWED_COMMANDS.has(actualCommand)) {
    throw new ShellError(`Command not allowed: ${actualCommand}`, null, "");
  }

  // Validate all arguments don't contain shell metacharacters
  for (const arg of args) {
    if (arg.includes(";") || arg.includes("|") || arg.includes("&") || arg.includes("`") || arg.includes("$(")) {
      throw new ShellError(`Dangerous characters in argument: ${arg}`, null, "");
    }
  }

  try {
    const result = await execFileAsync(command, args, {
      timeout: options?.timeout ?? 10_000,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (err: any) {
    throw new ShellError(
      err.message || "Command failed",
      err.code ?? null,
      err.stderr || "",
    );
  }
}

/** Run a systemctl command on a service */
export async function systemctl(action: string, serviceName: string): Promise<string> {
  if (!validateAction(action)) {
    throw new ShellError(`Invalid systemctl action: ${action}`, null, "");
  }
  if (!validateServiceName(serviceName)) {
    throw new ShellError(`Invalid service name: ${serviceName}`, null, "");
  }

  const unit = serviceName.endsWith(".service") ? serviceName : `${serviceName}.service`;
  const { stdout } = await safeExec("sudo", ["systemctl", action, unit]);
  return stdout.trim();
}

/** Run journalctl for a service */
export async function journalctl(
  serviceName: string,
  options?: { lines?: number; since?: string },
): Promise<string> {
  if (!validateServiceName(serviceName)) {
    throw new ShellError(`Invalid service name: ${serviceName}`, null, "");
  }

  const unit = serviceName.endsWith(".service") ? serviceName : `${serviceName}.service`;
  const args = ["journalctl", "-u", unit, "--no-pager", "-o", "short-iso"];

  if (options?.lines) {
    args.push("-n", String(Math.min(options.lines, 500)));
  } else {
    args.push("-n", "100");
  }

  if (options?.since) {
    // Validate since format (e.g., "1h", "30m", "2024-01-01")
    if (/^[0-9]+[smhd]$/.test(options.since) || /^\d{4}-\d{2}-\d{2}/.test(options.since)) {
      args.push("--since", options.since);
    }
  }

  const { stdout } = await safeExec("sudo", args, { timeout: 15_000 });
  return stdout;
}
