import { Description, Fieldset, Input, MultiSelectComboBox } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import {
  type InviteUserFormData,
  type InviteUserInput,
  inviteUserSchema,
} from "./inviteUser.schema";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";

interface InviteUserFormProps {
  groups: GroupInfo[];
  inviteAnother?: boolean;
  actionData?: { success?: boolean; message?: string };
}

export function InviteUserForm({ groups, inviteAnother, actionData }: InviteUserFormProps) {
  const submit = useSubmit();

  const { control, handleSubmit, reset } = useForm<InviteUserInput, unknown, InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      groupIds: [],
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (actionData?.success === true) {
      reset({
        email: "",
        groupIds: [],
      });
    }
  }, [actionData, reset]);

  const onSubmit = (data: InviteUserFormData) => {
    const formData = new FormData();
    formData.append("email", data.email);
    for (const groupId of data.groupIds) {
      formData.append("groupIds", groupId);
    }
    if (inviteAnother) {
      formData.append("inviteAnother", "true");
    }
    submit(formData, { method: "post" });
  };

  const groupItems = groups.map((group) => ({ id: group.id, name: group.path }));

  return (
    <form id="invite-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          name="groupIds"
          render={({ field }) => (
            <MultiSelectComboBox
              label="Groups"
              items={groupItems}
              placeholder="Search groups…"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <Description size="sm">
          The invited user joins the selected groups at their first login and sees their shared data
          immediately.
        </Description>
      </Fieldset>
    </form>
  );
}
