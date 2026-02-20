import { useOutletContext, useParams } from "react-router";

import { UpdateUserForm } from "./updateUser.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { type UserWithGroups } from "~/.server/auth/keycloakAdmin";
import { RouteModal } from "~/components/RouteModal";

export { updateUserAction as action } from "./updateUser.action";

export const middleware = [authMiddleware];

export default function UserModal() {
  const { userId } = useParams();
  const { users } = useOutletContext<{ users: UserWithGroups[] }>();

  const match = users.find(({ user }) => user.id === userId);

  if (!match) {
    throw new Response("User not found", { status: 404 });
  }

  return (
    <RouteModal title="Edit User">
      <UpdateUserForm user={match.user} />
    </RouteModal>
  );
}
