import { useMemo, useState } from "react";
import { useNavigation, useSubmit } from "react-router";

import {
  type GroupInfo,
  type UserWithGroups,
} from "~/.server/auth/keycloakAdmin";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { Button, Icon, Select } from "~/components/Controls";
import { GroupPill } from "~/components/Pill/GroupPill";

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

function GroupSelector({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-rose-600 mt-2">No groups available.</p>;
  }
  return (
    <div className="mt-3">
      <Select
        options={options}
        value={value}
        onChange={onChange}
        renderOption={(option) => <GroupPill path={option.label} />}
      />
    </div>
  );
}

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

  const allGroupOptions = useMemo(
    () =>
      groups
        .filter((g) => !g.isAdmin)
        .map((g) => ({ label: g.path, value: g.id })),
    [groups],
  );

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedUserIds.includes(u.user.id)),
    [users, selectedUserIds],
  );

  // Remove: only groups at least one selected user is in
  const removeGroupOptions = useMemo(
    () =>
      allGroupOptions.filter((o) =>
        selectedUsers.some((u) => u.groupPaths.has(o.label)),
      ),
    [allGroupOptions, selectedUsers],
  );

  // Add: only groups where at least one selected user is NOT yet a member
  const addGroupOptions = useMemo(
    () =>
      allGroupOptions.filter((o) =>
        selectedUsers.some((u) => !u.groupPaths.has(o.label)),
      ),
    [allGroupOptions, selectedUsers],
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

      {config && intent && (
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
          {config.needsGroup && <GroupSelector
            options={getGroupOptions(intent)}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
          />}
        </ConfirmDialog>
      )}
    </>
  );
}
