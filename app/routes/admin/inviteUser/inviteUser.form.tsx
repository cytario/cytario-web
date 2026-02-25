import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import {
  type InviteUserFormData,
  inviteUserSchema,
} from "./inviteUser.schema";
import { Checkbox, Field, Fieldset, Input, Select } from "~/components/Controls";
import { GroupPill } from "~/routes/admin/users/GroupPill";

interface InviteUserFormProps {
  scope: string;
  groupOptions: string[];
  inviteAnother?: boolean;
  actionData?: { success?: boolean; message?: string };
}

export function InviteUserForm({ scope, groupOptions, inviteAnother, actionData }: InviteUserFormProps) {
  const submit = useSubmit();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      groupPath: scope,
      enabled: true,
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (actionData?.success === true) {
      reset({ email: "", firstName: "", lastName: "", groupPath: scope, enabled: true });
    }
  }, [actionData, reset, scope]);

  const onSubmit = (data: InviteUserFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    if (inviteAnother) {
      formData.append("inviteAnother", "true");
    }
    submit(formData, { method: "post" });
  };

  return (
    <form id="invite-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Fieldset>
        <Field
          label="Email"
          error={
            errors.email?.message
              ? { message: errors.email.message, type: "validation" }
              : undefined
          }
        >
          <Input
            {...register("email")}
            type="email"
            scale="large"
            theme="light"
          />
        </Field>
        <Field
          label="First name"
          error={
            errors.firstName?.message
              ? { message: errors.firstName.message, type: "validation" }
              : undefined
          }
        >
          <Input {...register("firstName")} scale="large" theme="light" />
        </Field>
        <Field
          label="Last name"
          error={
            errors.lastName?.message
              ? { message: errors.lastName.message, type: "validation" }
              : undefined
          }
        >
          <Input {...register("lastName")} scale="large" theme="light" />
        </Field>
        <Field label="Group Membership">
          {groupOptions.length > 0 ? (
            <Controller
              control={control}
              name="groupPath"
              render={({ field }) => (
                <Select
                  options={groupOptions.map((p) => ({ label: p, value: p }))}
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                  renderOption={(option) => (
                    <GroupPill path={option.value} />
                  )}
                />
              )}
            />
          ) : (
            <p className="text-sm text-slate-400">
              No groups available in this scope.
            </p>
          )}
        </Field>
        <Field
          label="Enabled"
          description="Uncheck to pre-provision the account without granting immediate access."
          inline
        >
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </Fieldset>
    </form>
  );
}
