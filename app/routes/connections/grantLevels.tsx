import { Icon, Tooltip } from "@cytario/design";

import { ORG_ROOT_SCOPE, adminCovers } from "~/utils/authorization";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type ClientProviderCatalog,
} from "~/utils/providerCatalog.schema";

const LOADING_HINT = "Loading storage roles…";
const UNAVAILABLE_HINT =
  "Access levels cannot be checked while the provider catalog is unavailable.";
const UNCOVERED_HINT = "This bucket does not allow access for this group.";

function roleCoversScope(allowedScopes: string[], grantScope: string): boolean {
  if (grantScope === "" || grantScope === ORG_ROOT_SCOPE || allowedScopes.length === 0) {
    return true;
  }
  return allowedScopes.some((allowed) => adminCovers(allowed, grantScope));
}

/**
 * Access levels offerable for a grant scope: each level needs a provider role
 * on the connection — and, when the bucket row is known, on that bucket —
 * whose allowed scopes cover the grant scope. Mirrors the server's
 * `validateProviderRefs`: an org-root grant and an unselected scope skip the
 * coverage check; an org-wide role (empty allowedScopes) covers any scope.
 * A public provider publishes no roles and only permits read-only.
 */
export function levelsForGrant(
  catalog: ClientProviderCatalog | undefined,
  providerConnectionId: string,
  grantScope: string,
  bucketRowId?: string,
): AccessLevel[] {
  const isPublic = (catalog?.providerConnections ?? []).some(
    (c) => c.id === providerConnectionId && c.isPublic,
  );
  if (isPublic) return ["read-only"];

  const roleLevels = new Set(
    (catalog?.providerRoles ?? [])
      .filter((role) => role.providerConnectionId === providerConnectionId)
      .filter((role) => bucketRowId === undefined || role.bucketIds.includes(bucketRowId))
      .filter((role) => roleCoversScope(role.allowedScopes, grantScope))
      .map((role) => role.accessLevel),
  );
  return ACCESS_LEVELS.filter((level) => roleLevels.has(level));
}

/** Why a grant row's access-level select is disabled, or undefined when a
 * level can be picked. */
export function grantLevelHint(
  catalogState: { catalog?: ClientProviderCatalog; loading: boolean; error?: string },
  providerConnectionId: string,
  grantScope: string,
  bucketRowId?: string,
): string | undefined {
  if (catalogState.error) return UNAVAILABLE_HINT;
  if (catalogState.loading) return LOADING_HINT;
  if (
    levelsForGrant(catalogState.catalog, providerConnectionId, grantScope, bucketRowId).length === 0
  ) {
    return UNCOVERED_HINT;
  }
  return undefined;
}

export function GrantLevelHint({ hint }: { hint: string }) {
  return (
    <Tooltip content={hint}>
      <span className="pointer-events-auto text-muted-foreground" aria-label={hint}>
        <Icon icon="Info" size="sm" />
      </span>
    </Tooltip>
  );
}
