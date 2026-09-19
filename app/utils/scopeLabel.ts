import { ORG_ROOT_SCOPE } from "./authorization";

/**
 * Resolves the user-facing label for an owner scope: each `*` segment is
 * replaced with the supplied organization identifier; everything else passes
 * through unchanged.
 */
export function resolveScopeLabel(scope: string, organization?: string | null): string {
  if (!organization) return scope;
  return scope
    .split("/")
    .map((segment) => (segment === ORG_ROOT_SCOPE ? organization : segment))
    .join("/");
}
