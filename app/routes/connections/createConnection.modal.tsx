import { useSearchParams } from "react-router";

import { ConnectionForm } from "./connection.form";
import { RouteModal } from "~/components/RouteModal";
import { useCurrentUser } from "~/hooks/useCurrentUser";

/**
 * Resolve the best default owner scope from a URL scope param.
 * Prefers exact match in adminScopes, then covering parent, then the first
 * admin scope. Returns an empty string when the user has no admin scopes.
 */
export function resolveDefaultScope(scopeParam: string | null, adminScopes: string[]): string {
  if (!scopeParam) return adminScopes[0] ?? "";
  return (
    adminScopes.find((s) => scopeParam === s) ??
    adminScopes.find((s) => scopeParam.startsWith(s + "/")) ??
    adminScopes[0] ??
    ""
  );
}

export default function CreateConnectionModal({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser();
  const [searchParams] = useSearchParams();

  if (!user) return null;

  const defaultScope = resolveDefaultScope(searchParams.get("scope"), user.adminScopes);

  return (
    <RouteModal title="Add Connection" onClose={onClose}>
      <ConnectionForm
        adminScopes={user.adminScopes}
        userId={user.sub}
        defaultScope={defaultScope}
      />
    </RouteModal>
  );
}
