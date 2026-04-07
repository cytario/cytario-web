import { Checkbox, Field, Fieldset, Input, Select } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { type InviteUserFormData, inviteUserSchema } from "./inviteUser.schema";

interface InviteUserFormProps {
  scope: string;
  groupOptions: string[];
  inviteAnother?: boolean;
  actionData?: { success?: boolean; message?: string };
}

export function InviteUserForm({
  scope,
  groupOptions,
  inviteAnother,
  actionData,
}: InviteUserFormProps) {
  const submit = useSubmit();

  const {
    control,
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
      reset({
        email: "",
        firstName: "",
        lastName: "",
        groupPath: scope,
        enabled: true,
      });
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
    <form
      id="invite-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Fieldset>
        <Field label="Email" error={errors.email}>
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <Input
                type="email"
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field label="First name" error={errors.firstName}>
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <Input
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <Input
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        {groupOptions.length > 0 ? (
          <Controller
            control={control}
            name="groupPath"
            render={({ field }) => (
              <Select
                label="Group Membership"
                items={groupOptions.map((p) => ({ id: p, name: p }))}
                selectedKey={field.value}
                onSelectionChange={(key) => field.onChange(key as string)}
              />
            )}
          />
        ) : (
          <Field label="Group Membership">
            <p className="text-sm text-slate-400">
              No groups available in this scope.
            </p>
          </Field>
        )}
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Checkbox isSelected={field.value} onChange={field.onChange}>
                Enabled
              </Checkbox>
            )}
          />
          <p className="text-sm text-slate-500">
            Uncheck to pre-provision the account without granting immediate access.
          </p>
        </div>
      </Fieldset>
    </form>
  );
}
