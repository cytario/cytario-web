import { useRouteLoaderData, useSearchParams } from "react-router";

import { ConnectionForm } from "./connection.form";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { RouteModal } from "~/components/RouteModal";

/**
 * Resolve the best default owner scope from a URL scope param.
 * Prefers exact match in adminScopes, then covering parent, then userId fallback.
 */
export function resolveDefaultScope(
  scopeParam: string | null,
  adminScopes: string[],
  userId: string,
): string {
  if (!scopeParam) return userId;
  return (
    adminScopes.find((s) => scopeParam === s) ??
    adminScopes.find((s) => scopeParam.startsWith(s + "/")) ??
    userId
  );
}

export default function CreateConnectionModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const rootData = useRouteLoaderData("root") as
    | { user?: UserProfile }
    | undefined;
  const user = rootData?.user;
  const [searchParams] = useSearchParams();

  if (!user) return null;

  const defaultScope = resolveDefaultScope(
    searchParams.get("scope"),
    user.adminScopes,
    user.sub,
  );

  return (
    <RouteModal title="Connect Storage" onClose={onClose}>
      <ConnectionForm
        adminScopes={user.adminScopes}
        userId={user.sub}
        defaultOwnerScope={defaultScope}
      />
    </RouteModal>
  );
}
