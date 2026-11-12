import { Button, Checkbox, useToast } from "@cytario/design";
import { useEffect, useState } from "react";
import { useActionData, useLoaderData, useNavigate, useNavigation } from "react-router";

import { InviteUserForm } from "./inviteUser.form";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { RouteModal } from "~/components/RouteModal";

export { inviteUserAction as action } from "./inviteUser.action";
export { inviteUserLoader as loader } from "./inviteUser.loader";

export default function InviteModal() {
  const navigate = useNavigate();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";
  const { toast } = useToast();

  const { groups } = useLoaderData<{ groups: GroupInfo[] }>();

  const [inviteAnother, setInviteAnother] = useState(false);

  const actionData = useActionData<{
    success?: boolean;
    message?: string;
  }>();

  useEffect(() => {
    if (actionData?.success === true) {
      toast({ variant: "success", message: actionData.message! });
    } else if (actionData?.success === false) {
      toast({ variant: "error", message: actionData.message! });
    }
  }, [actionData, toast]);

  return (
    <RouteModal title="Invite User">
      <InviteUserForm groups={groups} inviteAnother={inviteAnother} actionData={actionData} />
      <footer className="flex items-center gap-3 mt-6">
        <Checkbox isSelected={inviteAnother} onChange={setInviteAnother} className="mr-auto">
          <span className="text-sm text-muted-foreground">Invite another</span>
        </Checkbox>
        <Button onPress={() => navigate(-1)} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" form="invite-form" isDisabled={isSubmitting}>
          {isSubmitting ? "Inviting..." : "Send Invite"}
        </Button>
      </footer>
    </RouteModal>
  );
}
