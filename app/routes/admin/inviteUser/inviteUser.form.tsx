import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useLoaderData, useNavigation, useSubmit } from "react-router";

import {
  type InviteUserFormData,
  inviteUserSchema,
} from "./inviteUser.schema";
import { Button, Field, Fieldset, Input, Select } from "~/components/Controls";

export function InviteUserForm() {
  const { scope, groupOptions } = useLoaderData<{
    scope: string;
    groupOptions: string[];
  }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      groupPath: scope,
    },
    mode: "onBlur",
  });

  const onSubmit = (data: InviteUserFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
    submit(formData, { method: "post" });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        <Field label="Group">
          <Controller
            control={control}
            name="groupPath"
            render={({ field }) => (
              <Select
                options={groupOptions.map((p) => ({ label: p, value: p }))}
                value={field.value}
                onChange={field.onChange}
                name={field.name}
              />
            )}
          />
        </Field>
      </Fieldset>
      <Button type="submit" theme="primary" disabled={isSubmitting}>
        {isSubmitting ? "Inviting..." : "Send Invite"}
      </Button>
    </form>
  );
}
