import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { type KeycloakUser } from "~/.server/auth/keycloakAdmin/client";
import { Button, Field, Fieldset, Input, Switch } from "~/components/Controls";
import {
  type UpdateUserFormData,
  updateUserSchema,
} from "~/routes/admin/updateUser/updateUser.schema";

interface UpdateUserFormProps {
  user: KeycloakUser;
}

/**
 * Form for editing user details (email, name, enabled status).
 */
export const UpdateUserForm = ({ user }: UpdateUserFormProps) => {
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled,
    },
    mode: "onBlur",
  });

  /** Converts form data to FormData and submits to the action */
  const onSubmit = (data: UpdateUserFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    submit(formData, { method: "post" });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="">
      <Fieldset>
        <Field label="Email" error={errors.email}>
          <Input
            {...register("email")}
            type="email"
            scale="large"
            theme="light"
          />
        </Field>
        <Field label="First name" error={errors.firstName}>
          <Input {...register("firstName")} scale="large" theme="light" />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input {...register("lastName")} scale="large" theme="light" />
        </Field>
        <Field label="Account enabled" inline>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={() => field.onChange(!field.value)}
              />
            )}
          />
        </Field>
      </Fieldset>
      <footer className="pt-4">
        <Button type="submit" theme="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </footer>
    </form>
  );
};
