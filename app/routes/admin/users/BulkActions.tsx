import { useState } from "react";
import { useNavigation, useSubmit } from "react-router";

import { GroupPill } from "../../../components/Pill/GroupPill";
import {
  type GroupInfo,
  type UserWithGroups,
} from "~/.server/auth/keycloakAdmin";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { Button, Icon, Select } from "~/components/Controls";

type BulkIntent =
  | "addToGroup"
  | "removeFromGroup"
  | "enableAccounts"
  | "disableAccounts";

interface BulkActionsProps {
  selectedUserIds: string[];
  users: UserWithGroups[];
  groups: GroupInfo[];
  onSuccess: () => void;
}

const dialogConfig: Record<
  BulkIntent,
  {
    title: string;
    confirmLabel: string;
    confirmTheme: "error" | "primary";
    needsGroup: boolean;
  }
> = {
  addToGroup: {
    title: "Add to Group",
    confirmLabel: "Add to Group",
    confirmTheme: "primary",
    needsGroup: true,
  },
  removeFromGroup: {
    title: "Remove from Group",
    confirmLabel: "Remove from Group",
    confirmTheme: "error",
    needsGroup: true,
  },
  enableAccounts: {
    title: "Enable Accounts",
    confirmLabel: "Enable",
    confirmTheme: "primary",
    needsGroup: false,
  },
  disableAccounts: {
    title: "Disable Accounts",
    confirmLabel: "Disable",
    confirmTheme: "error",
    needsGroup: false,
  },
};

export function BulkActions({
  selectedUserIds,
  users,
  groups,
  onSuccess,
}: BulkActionsProps) {
  const submit = useSubmit();
  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [intent, setIntent] = useState<BulkIntent | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const nonAdminGroups = groups.filter((g) => !g.isAdmin);
  const allGroupOptions = nonAdminGroups.map((g) => ({
    label: g.path,
    value: g.id,
  }));

  const selectedUsers = users.filter((u) =>
    selectedUserIds.includes(u.user.id),
  );

  // Remove: only groups at least one selected user is in
  const removeGroupOptions = allGroupOptions.filter((o) =>
    selectedUsers.some((u) => u.groupPaths.has(o.label)),
  );

  // Add: only groups where at least one selected user is NOT yet a member
  const addGroupOptions = allGroupOptions.filter((o) =>
    selectedUsers.some((u) => !u.groupPaths.has(o.label)),
  );

  const getGroupOptions = (i: BulkIntent) =>
    i === "removeFromGroup"
      ? removeGroupOptions
      : i === "addToGroup"
        ? addGroupOptions
        : allGroupOptions;

  const openDialog = (newIntent: BulkIntent) => {
    setIntent(newIntent);
    setSelectedGroupId(getGroupOptions(newIntent)[0]?.value ?? "");
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (!intent) return;

    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("userIds", selectedUserIds.join(","));
    if (
      selectedGroupId &&
      (intent === "addToGroup" || intent === "removeFromGroup")
    ) {
      formData.set("groupId", selectedGroupId);
    }

    submit(formData, { method: "post" });
    setDialogOpen(false);
    onSuccess();
  };

  const handleCancel = () => {
    setDialogOpen(false);
    setIntent(null);
    setSelectedGroupId("");
  };

  const config = intent ? dialogConfig[intent] : null;
  const count = selectedUserIds.length;

  return (
    <>
      <Button
        theme="white"
        scale="small"
        onClick={() => openDialog("addToGroup")}
        disabled={isSubmitting}
      >
        <Icon icon="UserPlus" size={14} />
        Add to group
      </Button>
      <Button
        theme="white"
        scale="small"
        onClick={() => openDialog("removeFromGroup")}
        disabled={isSubmitting}
      >
        <Icon icon="UserMinus" size={14} />
        Remove from group
      </Button>
      <Button
        theme="white"
        scale="small"
        onClick={() => openDialog("enableAccounts")}
        disabled={isSubmitting}
      >
        <Icon icon="Check" size={14} />
        Enable
      </Button>
      <Button
        theme="error"
        scale="small"
        onClick={() => openDialog("disableAccounts")}
        disabled={isSubmitting}
      >
        <Icon icon="Ban" size={14} />
        Disable
      </Button>

      {config && (
        <ConfirmDialog
          open={dialogOpen}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          title={config.title}
          confirmLabel={config.confirmLabel}
          confirmTheme={config.confirmTheme}
        >
          <p className="text-sm text-slate-600">
            This will affect{" "}
            <span className="font-medium text-slate-900">{count}</span> user
            {count !== 1 ? "s" : ""}.
          </p>
          {config.needsGroup &&
            (() => {
              const options = getGroupOptions(intent!);
              return options.length > 0 ? (
                <div className="mt-3">
                  <Select
                    options={options}
                    value={selectedGroupId}
                    onChange={setSelectedGroupId}
                    renderOption={(option) => <GroupPill path={option.label} />}
                  />
                </div>
              ) : (
                <p className="text-sm text-rose-600 mt-2">
                  No groups available.
                </p>
              );
            })()}
        </ConfirmDialog>
      )}
    </>
  );
}
