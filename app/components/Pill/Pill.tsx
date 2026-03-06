import { twMerge } from "tailwind-merge";

const pillColors = [
  "bg-sky-200 text-sky-900",
  "bg-amber-200 text-amber-900",
  "bg-emerald-200 text-emerald-900",
  "bg-rose-200 text-rose-900",
  "bg-violet-200 text-violet-900",
  "bg-orange-200 text-orange-900",
  "bg-teal-200 text-teal-900",
  "bg-fuchsia-200 text-fuchsia-900",
];

/** Deterministic color from a string via simple hash. */
export function pillColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return pillColors[Math.abs(hash) % pillColors.length];
}

interface PillProps {
  name: string;
  className?: string;
}

/** Colored label badge with a deterministic hash-based background. */
export function Pill({ name, className }: PillProps) {
  return (
    <span
      className={twMerge(
        "inline-flex items-center h-5 px-2 rounded-full text-xs font-medium whitespace-nowrap",
        pillColorClass(name),
        className,
      )}
    >
      {name}
    </span>
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format an ownerScope value into a human-readable label. */
export function formatScopeLabel(ownerScope: string): string {
  if (!ownerScope || UUID_RE.test(ownerScope)) return "Personal";
  const segments = ownerScope.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? ownerScope;
}

/** Scope badge that renders "Personal" for user IDs or the group name for group scopes. */
export function ScopePill({ ownerScope, className }: { ownerScope: string; className?: string }) {
  const label = formatScopeLabel(ownerScope);
  return <Pill name={label} className={className} />;
}
