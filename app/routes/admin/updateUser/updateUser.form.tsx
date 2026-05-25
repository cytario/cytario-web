import { Checkbox, Fieldset, H3, Input } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { type KeycloakUser } from "~/.server/auth/keycloakAdmin/client";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { ScopePill } from "~/components/Pills/ScopePill";
import {
  type UpdateUserFormData,
  updateUserSchema,
} from "~/routes/admin/updateUser/updateUser.schema";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

const isAdminGroup = (g: GroupInfo): boolean => g.name === "admins";

interface UpdateUserFormProps {
  user: KeycloakUser;
  groups: GroupInfo[];
  groupPaths: Set<string>;
}

export const UpdateUserForm = ({ user, groups, groupPaths }: UpdateUserFormProps) => {
  const submit = useSubmit();

  const [memberGroupIds, setMemberGroupIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (groupPaths.has(group.path)) ids.add(group.id);
    }
    return ids;
  });

  const { control, handleSubmit } = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled,
    },
    mode: "onBlur",
  });

  const [showConfirm, setShowConfirm] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  const buildFormData = (data: UpdateUserFormData): FormData => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    // Send only the membership diff: KC's org-group member endpoints are
    // not idempotent (DELETE on a non-member returns 404), and avoiding
    // no-op calls also cuts traffic on every save.
    for (const group of groups) {
      const was = groupPaths.has(group.path);
      const now = memberGroupIds.has(group.id);
      if (now && !was) formData.append(`add-group-${group.id}`, "true");
      if (!now && was) formData.append(`remove-group-${group.id}`, "true");
    }
    return formData;
  };

  const detectDestructiveChanges = (data: UpdateUserFormData): string[] => {
    const changes: string[] = [];

    if (user.enabled && !data.enabled) {
      changes.push(`Disable account for ${user.firstName} ${user.lastName}`);
    }

    const addedAdminGroups = groups.filter(
      (g) => isAdminGroup(g) && !groupPaths.has(g.path) && memberGroupIds.has(g.id),
    );
    if (addedAdminGroups.length > 0) {
      const names = addedAdminGroups.map((g) => g.path).join(", ");
      changes.push(`Grant admin access: ${names}`);
    }

    const removedAdminGroups = groups.filter(
      (g) => isAdminGroup(g) && groupPaths.has(g.path) && !memberGroupIds.has(g.id),
    );
    if (removedAdminGroups.length > 0) {
      const names = removedAdminGroups.map((g) => g.path).join(", ");
      changes.push(`Revoke admin access: ${names}`);
    }

    const removedGroups = groups.filter(
      (g) => !isAdminGroup(g) && groupPaths.has(g.path) && !memberGroupIds.has(g.id),
    );
    if (removedGroups.length > 0) {
      const names = removedGroups.map((g) => g.path).join(", ");
      changes.push(`Remove from groups: ${names}`);
    }

    return changes;
  };

  const onSubmit = (data: UpdateUserFormData) => {
    const formData = buildFormData(data);
    const destructiveChanges = detectDestructiveChanges(data);

    if (destructiveChanges.length > 0) {
      setPendingFormData(formData);
      setWarnings(destructiveChanges);
      setShowConfirm(true);
      return;
    }

    submit(formData, { method: "post" });
  };

  const onConfirm = () => {
    if (pendingFormData) {
      submit(pendingFormData, { method: "post" });
    }
    setShowConfirm(false);
    setPendingFormData(null);
  };

  const onCancelConfirm = () => {
    setShowConfirm(false);
    setPendingFormData(null);
  };

  const toggleGroup = (groupId: string) => {
    setMemberGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <>
      <form id="update-form" onSubmit={handleSubmit(onSubmit)} className="">
        <Fieldset>
          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <Input
                label="Email"
                type="email"
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="firstName"
            render={({ field, fieldState }) => (
              <Input
                label="First name"
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="lastName"
            render={({ field, fieldState }) => (
              <Input
                label="Last name"
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <Checkbox
                  isSelected={field.value}
                  onChange={(isSelected) => field.onChange(isSelected)}
                >
                  Enabled
                </Checkbox>
              )}
            />
          </div>
        </Fieldset>

        {(() => {
          const renderable = groups.filter((g) => g.path !== ORG_ROOT_SCOPE);
          if (renderable.length === 0) return null;
          return (
            <Fieldset className="my-8">
              <H3>Group Membership</H3>
              {renderable.map((group) => (
                <label key={group.id} className="flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    aria-label={group.path}
                    checked={memberGroupIds.has(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    className="w-4 h-4 cursor-pointer accent-(--color-action-primary)"
                  />
                  <ScopePill scope={group.path} />
                </label>
              ))}
            </Fieldset>
          );
        })()}
      </form>

      <ConfirmDialog
        open={showConfirm}
        onConfirm={onConfirm}
        onCancel={onCancelConfirm}
        title="Confirm Changes"
        confirmLabel="Save Changes"
        confirmVariant="primary"
      >
        <p className="text-sm text-slate-600">You are about to make the following changes:</p>
        <ul className="list-disc list-inside text-sm text-slate-900 space-y-1">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
};
