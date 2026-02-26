"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/");
        return;
      }

      setError(data.error || "Login failed");
      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (data.retryAfterMs) setRetryAfter(Math.ceil(data.retryAfterMs / 1000));
      setPassword("");
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-medium">
      <div className="w-full max-w-sm">
        <div className="bg-background border border-border-main rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-bold text-foreground text-center mb-1">
            Service Panel
          </h1>
          <p className="text-foreground-medium text-sm text-center mb-8">
            Enter your password to continue
          </p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full px-4 py-3 text-sm bg-background-medium border border-border-main rounded-xl text-foreground placeholder:text-foreground-low focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />

            {error && (
              <div className="mt-3 text-xs text-red-600 dark:text-red-400">
                {error}
                {remaining !== null && remaining > 0 && (
                  <span className="ml-1">({remaining} attempts remaining)</span>
                )}
                {retryAfter !== null && retryAfter > 0 && (
                  <span className="ml-1">(retry in {retryAfter}s)</span>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full mt-4 px-4 py-3 text-sm font-medium rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
