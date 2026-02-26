"use client";

import { useState, useEffect, useCallback } from "react";

interface EnvEntry {
  key: string;
  value: string;
  sensitive: boolean;
}

function getCsrfToken(): string {
  const match = document.cookie.match(/lsp_csrf=([^;]+)/);
  return match ? match[1] : "";
}

export function EnvEditor({ serviceName }: { serviceName: string }) {
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [original, setOriginal] = useState<EnvEntry[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/${serviceName}/env`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setOriginal(data.entries);
      }
    } catch {
      setError("Failed to load env file");
    } finally {
      setLoading(false);
    }
  }, [serviceName]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const hasChanges = JSON.stringify(entries) !== JSON.stringify(original);

  const revealValue = async (key: string) => {
    if (revealed[key]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    try {
      const res = await fetch(`/api/services/${serviceName}/env/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealed((prev) => ({ ...prev, [key]: data.value }));
      }
    } catch {
      // ignore
    }
  };

  const updateEntry = (index: number, field: "key" | "value", newValue: string) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: newValue };
      return next;
    });
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, { key: "", value: "", sensitive: false }]);
  };

  const save = async () => {
    if (!password) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Build final entries — merge revealed values for sensitive fields the user didn't change
      const finalEntries = entries.map((e) => {
        if (e.sensitive && e.value === "••••••••") {
          // Use revealed value if available, otherwise keep the masked value (server will reject)
          return { key: e.key, value: revealed[e.key] || e.value };
        }
        return { key: e.key, value: e.value };
      });

      // Check if any masked values remain (user didn't reveal them)
      const masked = finalEntries.filter((e) => e.value === "••••••••");
      if (masked.length > 0) {
        setError(`Reveal these sensitive values before saving: ${masked.map((e) => e.key).join(", ")}`);
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/services/${serviceName}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ entries: finalEntries, password }),
      });

      if (res.ok) {
        setSuccess("Saved successfully. A backup was created.");
        setShowConfirm(false);
        setPassword("");
        await fetchEntries();
        setRevealed({});
      } else {
        const data = await res.json();
        setError(data.error || "Save failed");
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-foreground-medium text-sm p-4">Loading env file…</div>;
  }

  return (
    <div className="border border-border-main rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-background-medium border-b border-border-main">
        <h3 className="text-sm font-semibold text-foreground">Environment Variables</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={addEntry}
            className="text-xs text-primary hover:text-primary/80 font-medium"
          >
            + Add
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs">
          {success}
        </div>
      )}

      <div className="divide-y divide-border-main">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2">
            <input
              value={entry.key}
              onChange={(e) => updateEntry(i, "key", e.target.value)}
              placeholder="KEY"
              className="w-1/3 text-xs font-mono bg-transparent border border-border-main rounded-md px-2 py-1.5 text-foreground"
            />
            <div className="flex-1 flex items-center gap-1">
              <input
                value={entry.sensitive && !revealed[entry.key] ? entry.value : (revealed[entry.key] || entry.value)}
                onChange={(e) => updateEntry(i, "value", e.target.value)}
                placeholder="value"
                className="flex-1 text-xs font-mono bg-transparent border border-border-main rounded-md px-2 py-1.5 text-foreground"
                type={entry.sensitive && !revealed[entry.key] ? "password" : "text"}
              />
              {entry.sensitive && (
                <button
                  onClick={() => revealValue(entry.key)}
                  className="text-xs text-foreground-low hover:text-foreground-medium px-1.5 shrink-0"
                  title={revealed[entry.key] ? "Hide" : "Reveal"}
                >
                  {revealed[entry.key] ? "Hide" : "Show"}
                </button>
              )}
            </div>
            <button
              onClick={() => removeEntry(i)}
              className="text-foreground-low hover:text-red-500 text-sm px-1 shrink-0"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {hasChanges && (
        <div className="px-4 py-3 border-t border-border-main bg-background-medium">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              Save Changes
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="Confirm password to save"
                className="flex-1 text-xs bg-background border border-border-main rounded-md px-3 py-2 text-foreground"
                autoFocus
              />
              <button
                onClick={save}
                disabled={saving || !password}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setPassword(""); }}
                className="px-3 py-2 text-xs text-foreground-medium hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
