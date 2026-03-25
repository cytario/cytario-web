import { useRouteLoaderData } from "react-router";

import { AddConnectionForm } from "./addConnection.form";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { RouteModal } from "~/components/RouteModal";

export default function AddConnectionModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const rootData = useRouteLoaderData("root") as
    | { user?: UserProfile }
    | undefined;
  const user = rootData?.user;

  if (!user) return null;

  return (
    <RouteModal title="Connect Storage" onClose={onClose}>
      <AddConnectionForm adminScopes={user.adminScopes} userId={user.sub} />
    </RouteModal>
  );
}
