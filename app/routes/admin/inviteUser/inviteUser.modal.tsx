import { Button } from "@cytario/design";
import { useCallback, useState } from "react";
import { useLoaderData, useNavigate, useNavigation } from "react-router";

import { InviteUserForm } from "./inviteUser.form";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { RouteModal } from "~/components/RouteModal";

export { inviteUserAction as action } from "./inviteUser.action";
export { inviteUserLoader as loader } from "./inviteUser.loader";

export default function InviteModal() {
  const navigate = useNavigate();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  const { groups } = useLoaderData<{ groups: GroupInfo[] }>();

  const [emailCount, setEmailCount] = useState(0);
  const onEmailCountChange = useCallback((count: number) => setEmailCount(count), []);

  return (
    <RouteModal title="Invite Users">
      <InviteUserForm groups={groups} onEmailCountChange={onEmailCountChange} />
      <footer className="flex items-center gap-3 mt-6 justify-end">
        <Button onPress={() => navigate(-1)} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" form="invite-form" isDisabled={isSubmitting || emailCount === 0}>
          {isSubmitting ? "Inviting..." : "Send Invite"}
        </Button>
      </footer>
    </RouteModal>
  );
}
