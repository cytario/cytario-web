import { Badge, PathPill, type BadgeColor, pillColorFromName } from "@cytario/design";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "cytario" root segment always renders teal; everything else uses hash color. */
function scopeColor(segment: string, index: number): BadgeColor {
  if (index === 0 && segment.toLowerCase() === "cytario") return "teal";
  return pillColorFromName(segment);
}

interface ScopePillProps {
  scope: string;
  visibleCount?: number;
}

export function ScopePill({ scope, visibleCount }: ScopePillProps) {
  if (!scope || UUID_RE.test(scope)) {
    return <Badge color="slate">Personal</Badge>;
  }

  return (
    <PathPill visibleCount={visibleCount} colorFn={scopeColor}>
      {scope}
    </PathPill>
  );
}
