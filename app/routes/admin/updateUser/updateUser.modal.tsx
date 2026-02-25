import {
  useNavigate,
  useNavigation,
  useOutletContext,
  useParams,
} from "react-router";

import { UpdateUserForm } from "./updateUser.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import {
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Button } from "~/components/Controls";
import { RouteModal } from "~/components/RouteModal";

export { userDetailAction as action } from "./userDetail.action";

export const middleware = [authMiddleware];

export default function UserModal() {
  const navigate = useNavigate();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  const { userId } = useParams();
  const { users, groups } = useOutletContext<{
    users: UserWithGroups[];
    groups: GroupInfo[];
  }>();

  const match = users.find(({ user }) => user.id === userId);

  if (!match) {
    throw new Response("User not found", { status: 404 });
  }

  return (
    <RouteModal
      title={`Edit User \u2014 ${match.user.firstName} ${match.user.lastName}`}
      footer={
        <>
          <Button onClick={() => navigate(-1)} theme="white">
            Cancel
          </Button>
          <Button
            type="submit"
            form="update-form"
            theme="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </>
      }
    >
      <UpdateUserForm
        user={match.user}
        groups={groups}
        groupPaths={match.groupPaths}
      />
    </RouteModal>
  );
}
