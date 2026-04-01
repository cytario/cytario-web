import { Pill } from "@cytario/design";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format an ownerScope value into a human-readable label. */
function formatVisibilityLabel(scope: string): string {
  if (!scope || UUID_RE.test(scope)) return "Personal";
  const segments = scope.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? scope;
}

export function VisibilityPill({ scope }: { scope: string }) {
  return <Pill>{formatVisibilityLabel(scope)}</Pill>;
}
