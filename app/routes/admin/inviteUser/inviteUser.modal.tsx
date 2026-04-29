import { Button, Checkbox } from "@cytario/design";
import { useEffect, useState } from "react";
import {
  useActionData,
  useNavigate,
  useNavigation,
  useOutletContext,
} from "react-router";

import { InviteUserForm } from "./inviteUser.form";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { RouteModal } from "~/components/RouteModal";
import { toastBridge } from "~/toast-bridge";

export { inviteUserAction as action } from "./inviteUser.action";

export default function InviteModal() {
  const navigate = useNavigate();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  const { scope, groups } = useOutletContext<{
    scope: string;
    groups: GroupInfo[];
  }>();

  const groupOptions = groups.map((g) => g.path);

  const [inviteAnother, setInviteAnother] = useState(false);

  const actionData = useActionData<{
    success?: boolean;
    message?: string;
  }>();

  useEffect(() => {
    if (actionData?.success === true) {
      toastBridge.emit({ variant: "success", message: actionData.message! });
    } else if (actionData?.success === false) {
      toastBridge.emit({ variant: "error", message: actionData.message! });
    }
  }, [actionData]);

  return (
    <RouteModal title="Invite User">
      <InviteUserForm
        scope={scope}
        groupOptions={groupOptions}
        inviteAnother={inviteAnother}
        actionData={actionData}
      />
      <footer className="flex items-center gap-3 mt-6">
        <Checkbox
          isSelected={inviteAnother}
          onChange={setInviteAnother}
          className="mr-auto"
        >
          <span className="text-sm text-slate-600">Invite another</span>
        </Checkbox>
        <Button onPress={() => navigate(-1)} variant="secondary">
          Cancel
        </Button>
        <Button
          type="submit"
          form="invite-form"
          isDisabled={isSubmitting}
        >
          {isSubmitting ? "Inviting..." : "Send Invite"}
        </Button>
      </footer>
    </RouteModal>
  );
}
