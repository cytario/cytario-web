import { Button, Select } from "@cytario/design";
import { Ban, Check, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigation, useSubmit } from "react-router";

import {
  type GroupInfo,
  type UserWithGroups,
} from "~/.server/auth/keycloakAdmin";
import { ConfirmDialog } from "~/components/ConfirmDialog";

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
    confirmVariant: "destructive" | "primary";
    needsGroup: boolean;
  }
> = {
  addToGroup: {
    title: "Add to Group",
    confirmLabel: "Add to Group",
    confirmVariant: "primary",
    needsGroup: true,
  },
  removeFromGroup: {
    title: "Remove from Group",
    confirmLabel: "Remove from Group",
    confirmVariant: "destructive",
    needsGroup: true,
  },
  enableAccounts: {
    title: "Enable Accounts",
    confirmLabel: "Enable",
    confirmVariant: "primary",
    needsGroup: false,
  },
  disableAccounts: {
    title: "Disable Accounts",
    confirmLabel: "Disable",
    confirmVariant: "destructive",
    needsGroup: false,
  },
};

function GroupSelector({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-rose-600 mt-2">No groups available.</p>;
  }
  return (
    <div className="mt-3">
      <Select
        label="Group"
        items={options}
        selectedKey={value}
        onSelectionChange={(key) => onChange(key as string)}
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
        .map((g) => ({ id: g.id, name: g.path })),
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
        selectedUsers.some((u) => u.groupPaths.has(o.name)),
      ),
    [allGroupOptions, selectedUsers],
  );

  // Add: only groups where at least one selected user is NOT yet a member
  const addGroupOptions = useMemo(
    () =>
      allGroupOptions.filter((o) =>
        selectedUsers.some((u) => !u.groupPaths.has(o.name)),
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
    setSelectedGroupId(getGroupOptions(newIntent)[0]?.id ?? "");
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
        variant="secondary"
        size="sm"
        onPress={() => openDialog("addToGroup")}
        isDisabled={isSubmitting}
        iconLeft={UserPlus}
      >
        Add to group
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onPress={() => openDialog("removeFromGroup")}
        isDisabled={isSubmitting}
        iconLeft={UserMinus}
      >
        Remove from group
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onPress={() => openDialog("enableAccounts")}
        isDisabled={isSubmitting}
        iconLeft={Check}
      >
        Enable
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onPress={() => openDialog("disableAccounts")}
        isDisabled={isSubmitting}
        iconLeft={Ban}
      >
        Disable
      </Button>

      {config && intent && (
        <ConfirmDialog
          open={dialogOpen}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          title={config.title}
          confirmLabel={config.confirmLabel}
          confirmVariant={config.confirmVariant}
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
