import { Field as HuiField, Label } from "@headlessui/react";
import { useEffect, useState } from "react";
import {
  useActionData,
  useNavigate,
  useNavigation,
  useOutletContext,
} from "react-router";

import { InviteUserForm } from "./inviteUser.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { Button, Checkbox } from "~/components/Controls";
import { useNotificationStore } from "~/components/Notification/Notification.store";
import { RouteModal } from "~/components/RouteModal";

export { inviteUserAction as action } from "./inviteUser.action";

export const middleware = [authMiddleware];

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

  const addNotification = useNotificationStore(
    (state) => state.addNotification,
  );

  useEffect(() => {
    if (actionData?.success === true) {
      addNotification({ message: actionData.message!, status: "success" });
    } else if (actionData?.success === false) {
      addNotification({ message: actionData.message!, status: "error" });
    }
  }, [actionData, addNotification]);

  return (
    <RouteModal
      title="Invite User"
      footer={
        <>
          <HuiField className="flex items-center gap-2 text-sm text-slate-600 mr-auto cursor-pointer">
            <Checkbox
              checked={inviteAnother}
              onChange={() => setInviteAnother((v) => !v)}
            />
            <Label>Invite another</Label>
          </HuiField>
          <Button onClick={() => navigate(-1)} theme="white">
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-form"
            theme="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Inviting..." : "Send Invite"}
          </Button>
        </>
      }
    >
      <InviteUserForm
        scope={scope}
        groupOptions={groupOptions}
        inviteAnother={inviteAnother}
        actionData={actionData}
      />
    </RouteModal>
  );
}
