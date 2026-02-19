import { InviteUserForm } from "./inviteUser.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { RouteModal } from "~/components/RouteModal";

export { inviteUserAction as action } from "./inviteUser.action";
export { inviteUserLoader as loader } from "./inviteUser.loader";

export const middleware = [authMiddleware];

export default function InviteModal() {
  return (
    <RouteModal title="Invite User">
      <InviteUserForm />
    </RouteModal>
  );
}
