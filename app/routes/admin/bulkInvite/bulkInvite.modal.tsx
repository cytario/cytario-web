import { Button } from "@cytario/design";
import { useState } from "react";
import { useNavigate, useNavigation, useOutletContext } from "react-router";

import { BulkInviteForm } from "./bulkInvite.form";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { RouteModal } from "~/components/RouteModal";

export { bulkInviteAction as action } from "./bulkInvite.action";

export const middleware = [authMiddleware];

export default function BulkInviteModal() {
  const navigate = useNavigate();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  const { scope, groups } = useOutletContext<{
    scope: string;
    groups: GroupInfo[];
  }>();

  const groupOptions = groups.map((g) => g.path);

  const [nonEmptyCount, setNonEmptyCount] = useState(0);

  return (
    <RouteModal title="Bulk Invite Users" size="xl">
      <BulkInviteForm
        scope={scope}
        groupOptions={groupOptions}
        onNonEmptyCountChange={setNonEmptyCount}
      />
      <footer className="flex gap-3 justify-end mt-6">
        <Button onPress={() => navigate(-1)} variant="secondary">
          Cancel
        </Button>
        <Button
          type="submit"
          form="bulk-invite-form"
          isDisabled={isSubmitting || nonEmptyCount === 0}
        >
          {isSubmitting
            ? "Sending..."
            : `Send ${nonEmptyCount} Invite${nonEmptyCount !== 1 ? "s" : ""}`}
        </Button>
      </footer>
    </RouteModal>
  );
}
