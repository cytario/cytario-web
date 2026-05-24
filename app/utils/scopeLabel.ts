import { ORG_ROOT_ADMIN_SCOPE } from "./authorization";

/**
 * Resolves the user-facing label for an owner scope. Each `*` segment is
 * replaced with the supplied organization identifier (alias or display name);
 * everything else passes through unchanged. Callers without an organization in
 * scope get the raw value back.
 */
export function resolveScopeLabel(scope: string, organization?: string | null): string {
  if (!organization) return scope;
  return scope
    .split("/")
    .map((segment) => (segment === ORG_ROOT_ADMIN_SCOPE ? organization : segment))
    .join("/");
}
