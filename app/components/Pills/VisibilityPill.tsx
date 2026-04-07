import { Pill, type PillColor } from "@cytario/design";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VisibilityConfig {
  label: string;
  color: PillColor;
}

function resolveVisibility(scope: string): VisibilityConfig {
  if (!scope || UUID_RE.test(scope)) return { label: "Personal", color: "slate" };
  if (scope.toLowerCase().includes("cytario")) return { label: "Cytario", color: "teal" };
  const segments = scope.split("/").filter(Boolean);
  return { label: segments[segments.length - 1] ?? scope, color: "slate" };
}

interface VisibilityPillProps {
  scope: string;
}

export function VisibilityPill({ scope }: VisibilityPillProps) {
  const { label, color } = resolveVisibility(scope);
  return <Pill color={color}>{label}</Pill>;
}
