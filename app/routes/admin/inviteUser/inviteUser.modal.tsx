import { useOutletContext } from "react-router";

import { InviteUserForm } from "./inviteUser.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { RouteModal } from "~/components/RouteModal";

export { inviteUserAction as action } from "./inviteUser.action";

export const middleware = [authMiddleware];

export default function InviteModal() {
  const { scope, groups } = useOutletContext<{
    scope: string;
    groups: GroupInfo[];
  }>();

  const groupOptions = groups.map((g) => g.path);

  return (
    <RouteModal title="Invite User">
      <InviteUserForm scope={scope} groupOptions={groupOptions} />
    </RouteModal>
  );
}
