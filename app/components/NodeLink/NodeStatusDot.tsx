interface NodeStatusDotProps {
  status: "connected" | "error" | "loading";
  errorMessage?: string;
}

const VARIANTS = {
  connected: { className: "bg-emerald-500", label: "Connected" },
  error: { className: "bg-red-500", label: "Connection error" },
  loading: { className: "bg-amber-400 animate-pulse", label: "Connecting…" },
} as const;

export function NodeStatusDot({ status, errorMessage }: NodeStatusDotProps) {
  const { className, label } = VARIANTS[status];
  const fullLabel = status === "error" && errorMessage ? errorMessage : label;

  return (
    <div className="flex items-center justify-center w-6 h-6 bg-lime-400">
      <span
        role="img"
        aria-label={fullLabel}
        title={fullLabel}
        className={`inline-block shrink-0 w-2.5 h-2.5 rounded-full ${className}`}
      />
    </div>
  );
}
