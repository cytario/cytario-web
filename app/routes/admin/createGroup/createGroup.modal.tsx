import { Button } from "@cytario/design";
import { useNavigate, useNavigation, useOutletContext } from "react-router";

import { CreateGroupForm } from "./createGroup.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { RouteModal } from "~/components/RouteModal";

export { createGroupAction as action } from "./createGroup.action";

export const middleware = [authMiddleware];

export default function CreateGroupModal() {
  const navigate = useNavigate();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  const { scope } = useOutletContext<{ scope: string }>();

  return (
    <RouteModal title="Create Group">
      <CreateGroupForm scope={scope} />
      <footer className="flex items-center justify-end gap-3 mt-6">
        <Button onPress={() => navigate(-1)} variant="secondary">
          Cancel
        </Button>
        <Button
          type="submit"
          form="create-group-form"
          isDisabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Group"}
        </Button>
      </footer>
    </RouteModal>
  );
}
