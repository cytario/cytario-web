import { twMerge } from "tailwind-merge";

interface NodeStatusDotProps {
  status: "connected" | "error" | "loading";
  errorMessage?: string;
}

const VARIANTS = {
  connected: { className: "bg-success", label: "Connected" },
  error: { className: "bg-destructive", label: "Connection error" },
  loading: { className: "bg-warning animate-pulse", label: "Connecting…" },
} as const;

export function NodeStatusDot({ status, errorMessage }: NodeStatusDotProps) {
  const { className, label } = VARIANTS[status];
  const fullLabel = status === "error" && errorMessage ? errorMessage : label;

  const cx = twMerge(`inline-block shrink-0 w-2.5 h-2.5 rounded-full transition-colors`, className);

  return <span role="img" aria-label={fullLabel} title={fullLabel} className={cx} />;
}
