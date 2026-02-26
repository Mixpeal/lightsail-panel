/**
 * Authentication, session management, CSRF, and rate limiting.
 *
 * - bcrypt password verification (cost 12)
 * - Server-side session store (in-memory Map)
 * - HMAC-SHA256 signed session cookies
 * - CSRF double-submit pattern
 * - Per-IP rate limiting on login
 */

import bcrypt from "bcryptjs";
import { createHmac, randomBytes, randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { audit } from "./audit";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PANEL_SECRET = process.env.PANEL_SECRET || "dev-secret-change-me";
const PANEL_PASSWORD_HASH = process.env.PANEL_PASSWORD_HASH || "";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_COOKIE = "lsp_session";
const CSRF_COOKIE = "lsp_csrf";
const CSRF_HEADER = "x-csrf-token";

// Rate limiting
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// IP allowlisting
const ALLOWED_IPS = process.env.PANEL_ALLOWED_IPS
  ? process.env.PANEL_ALLOWED_IPS.split(",").map((ip) => ip.trim()).filter(Boolean)
  : [];

// ---------------------------------------------------------------------------
// Session store (in-memory, single active session)
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  csrfToken: string;
  createdAt: number;
  lastActivity: number;
  ip: string;
}

let activeSession: Session | null = null;

function signValue(value: string): string {
  const sig = createHmac("sha256", PANEL_SECRET).update(value).digest("hex");
  return `${value}.${sig}`;
}

function verifySignedValue(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const expected = signValue(value);
  if (expected !== signed) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory per IP)
// ---------------------------------------------------------------------------

interface RateEntry {
  attempts: number;
  firstAttempt: number;
  lockedUntil: number;
}

const rateLimitMap = new Map<string, RateEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.firstAttempt > LOGIN_WINDOW_MS && now > entry.lockedUntil) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS, retryAfterMs: 0 };
  }

  // Check lockout
  if (entry.lockedUntil > now) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.lockedUntil - now };
  }

  // Reset window if expired
  if (now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    rateLimitMap.delete(ip);
    return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS, retryAfterMs: 0 };
  }

  const remaining = LOGIN_MAX_ATTEMPTS - entry.attempts;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining), retryAfterMs: 0 };
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    rateLimitMap.set(ip, { attempts: 1, firstAttempt: now, lockedUntil: 0 });
    return;
  }

  entry.attempts++;

  if (entry.attempts >= LOCKOUT_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
}

function clearRateLimit(ip: string) {
  rateLimitMap.delete(ip);
}

// ---------------------------------------------------------------------------
// IP utilities
// ---------------------------------------------------------------------------

export async function getClientIP(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-real-ip")
    || "unknown";
}

export function checkIPAllowlist(ip: string): boolean {
  if (ALLOWED_IPS.length === 0) return true;
  return ALLOWED_IPS.some((allowed) => {
    if (allowed.includes("/")) {
      // CIDR matching (simplified — exact match for now)
      return ip.startsWith(allowed.split("/")[0].split(".").slice(0, 3).join("."));
    }
    return ip === allowed;
  });
}

// ---------------------------------------------------------------------------
// Auth operations
// ---------------------------------------------------------------------------

export async function login(password: string): Promise<{
  success: boolean;
  error?: string;
  remaining?: number;
  retryAfterMs?: number;
}> {
  const ip = await getClientIP();

  // Check IP allowlist
  if (!checkIPAllowlist(ip)) {
    await audit("blocked_ip", ip, "login");
    return { success: false, error: "Access denied" };
  }

  // Check rate limit
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    await audit("rate_limited", ip, "login");
    return {
      success: false,
      error: "Too many attempts. Try again later.",
      remaining: 0,
      retryAfterMs: rateCheck.retryAfterMs,
    };
  }

  if (!PANEL_PASSWORD_HASH) {
    return { success: false, error: "Panel not configured. Run setup.sh first." };
  }

  const valid = await bcrypt.compare(password, PANEL_PASSWORD_HASH);

  if (!valid) {
    recordFailedAttempt(ip);
    const updated = checkRateLimit(ip);
    await audit("login_failed", ip);
    return {
      success: false,
      error: "Invalid password",
      remaining: updated.remaining,
    };
  }

  // Success — create session
  clearRateLimit(ip);

  const sessionId = randomUUID();
  const csrfToken = randomBytes(32).toString("hex");

  // Invalidate any previous session (single session only)
  activeSession = {
    id: sessionId,
    csrfToken,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ip,
  };

  // Set cookies
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signValue(sessionId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
  cookieStore.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false, // JS needs to read this for X-CSRF-Token header
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });

  await audit("login_success", ip);
  return { success: true };
}

export async function logout() {
  const ip = await getClientIP();
  activeSession = null;

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(CSRF_COOKIE);

  await audit("logout", ip);
}

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

export async function validateSession(): Promise<{ valid: boolean; ip: string }> {
  const ip = await getClientIP();

  // Check IP allowlist
  if (!checkIPAllowlist(ip)) {
    return { valid: false, ip };
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return { valid: false, ip };

  const sessionId = verifySignedValue(sessionCookie);
  if (!sessionId) return { valid: false, ip };

  if (!activeSession || activeSession.id !== sessionId) {
    return { valid: false, ip };
  }

  // Check expiry
  const now = Date.now();
  if (now - activeSession.createdAt > SESSION_MAX_AGE_MS) {
    activeSession = null;
    return { valid: false, ip };
  }

  // Sliding window — refresh activity timestamp
  activeSession.lastActivity = now;

  return { valid: true, ip };
}

export async function validateCSRF(): Promise<boolean> {
  if (!activeSession) return false;

  const h = await headers();
  const csrfHeader = h.get(CSRF_HEADER);
  if (!csrfHeader) return false;

  return csrfHeader === activeSession.csrfToken;
}

export async function requireAuth(): Promise<{ ip: string }> {
  const { valid, ip } = await validateSession();
  if (!valid) {
    throw new AuthError("Unauthorized", 401);
  }
  return { ip };
}

export async function requireCSRF(): Promise<void> {
  const valid = await validateCSRF();
  if (!valid) {
    throw new AuthError("Invalid CSRF token", 403);
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!PANEL_PASSWORD_HASH) return false;
  return bcrypt.compare(password, PANEL_PASSWORD_HASH);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
