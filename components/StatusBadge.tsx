export function StatusBadge({ active, sub }: { active: string; sub: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    inactive: "bg-foreground-low/20 text-foreground-medium",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    activating: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    deactivating: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  const colors = colorMap[active] || colorMap.inactive;
  const label = sub === "running" ? "Running" : sub === "dead" ? "Stopped" : sub === "failed" ? "Failed" : `${active}/${sub}`;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          active === "active" ? "bg-emerald-500 animate-pulse" : active === "failed" ? "bg-red-500" : "bg-foreground-low"
        }`}
      />
      {label}
    </span>
  );
}
