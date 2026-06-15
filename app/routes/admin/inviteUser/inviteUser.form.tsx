import { Fieldset, Input } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { type InviteUserFormData, inviteUserSchema } from "./inviteUser.schema";

interface InviteUserFormProps {
  scope: string;
  inviteAnother?: boolean;
  actionData?: { success?: boolean; message?: string };
}

export function InviteUserForm({ scope, inviteAnother, actionData }: InviteUserFormProps) {
  const submit = useSubmit();

  const { control, handleSubmit, reset } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (actionData?.success === true) {
      reset({
        email: "",
        firstName: "",
        lastName: "",
      });
    }
  }, [actionData, reset]);

  const onSubmit = (data: InviteUserFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    formData.append("scope", scope);
    if (inviteAnother) {
      formData.append("inviteAnother", "true");
    }
    submit(formData, { method: "post" });
  };

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
          name="firstName"
          render={({ field, fieldState }) => (
            <Input
              label="First name (optional)"
              size="lg"
              value={field.value ?? ""}
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
              label="Last name (optional)"
              size="lg"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
        <p className="text-sm text-muted-foreground">
          Keycloak emails the invite to the address above. Group membership can be assigned after
          the user accepts.
        </p>
      </Fieldset>
    </form>
  );
}
