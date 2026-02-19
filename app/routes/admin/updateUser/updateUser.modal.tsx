import { useLoaderData } from "react-router";

import { UpdateUserForm } from "./updateUser.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { type KeycloakUser } from "~/.server/auth/keycloakAdmin/client";
import { RouteModal } from "~/components/RouteModal";

export { updateUserLoader as loader } from "./updateUser.loader";
export { updateUserAction as action } from "./updateUser.action";

export const middleware = [authMiddleware];

/**
 * Modal wrapper for editing user details.
 */
export default function UserModal() {
  const { user } = useLoaderData<{
    user: KeycloakUser;
    scope: string;
  }>();

  return (
    <RouteModal title="Edit User">
      <UpdateUserForm user={user} />
    </RouteModal>
  );
}
