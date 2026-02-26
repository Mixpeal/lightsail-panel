"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function LogViewer({ serviceName }: { serviceName: string }) {
  const [logs, setLogs] = useState("");
  const [lines, setLines] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/${serviceName}/logs?lines=${lines}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || "No logs available");
      }
    } catch {
      setLogs("Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [serviceName, lines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="border border-border-main rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-background-medium border-b border-border-main">
        <h3 className="text-sm font-semibold text-foreground">Logs</h3>
        <div className="flex items-center gap-3">
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            className="text-xs bg-background border border-border-main rounded-md px-2 py-1 text-foreground"
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
            <option value={500}>500 lines</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-foreground-medium cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchLogs}
            className="text-xs text-primary hover:text-primary/80 font-medium"
          >
            Refresh
          </button>
        </div>
      </div>
      <pre
        ref={scrollRef}
        className="p-4 text-xs leading-relaxed text-foreground-medium bg-background overflow-auto max-h-[500px] whitespace-pre-wrap break-all font-mono"
      >
        {loading ? "Loading…" : logs}
      </pre>
    </div>
  );
}
