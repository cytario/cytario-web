import { useRouteLoaderData, useSearchParams } from "react-router";

import { ConnectionForm } from "./connection.form";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { RouteModal } from "~/components/RouteModal";

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

  // Pre-select the best matching admin scope from the URL's ?scope= param.
  // Prefer exact match, then fall back to the covering parent scope.
  const scopeParam = searchParams.get("scope");
  const matchingScope = scopeParam
    ? user.adminScopes.find((s) => scopeParam === s) ??
      user.adminScopes.find((s) => scopeParam.startsWith(s + "/"))
    : undefined;
  const defaultScope = matchingScope ?? user.sub;

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
