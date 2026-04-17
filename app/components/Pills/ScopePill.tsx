import {
  PathPill,
  Pill,
  type PillColor,
  pillColorFromName,
} from "@cytario/design";
import { Shield } from "lucide-react";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "cytario" root segment always renders teal; everything else uses hash color. */
function scopeColor(segment: string, index: number): PillColor {
  if (index === 0 && segment.toLowerCase() === "cytario") return "teal";
  return pillColorFromName(segment);
}

interface ScopePillProps {
  scope: string;
  visibleCount?: number;
}

export function ScopePill({ scope, visibleCount }: ScopePillProps) {
  if (!scope || UUID_RE.test(scope)) {
    return <Pill color="slate">Personal</Pill>;
  }

  const isAdmin = scope.endsWith("/admins");

  return (
    <div className="inline-flex items-center gap-1">
      {isAdmin ? (
        <Shield
          size={20}
          fill="white"
          aria-hidden="true"
          className={`
            shrink-0 
            border p-0.5 rounded-2xl
            bg-(--color-surface-muted) text-(--color-text-secondary)
          `}
        />
      ) : null}
      <PathPill visibleCount={visibleCount} colorFn={scopeColor}>
        {scope}
      </PathPill>
    </div>
  );
}
