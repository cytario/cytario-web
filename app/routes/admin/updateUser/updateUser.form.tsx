import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { type KeycloakUser } from "~/.server/auth/keycloakAdmin/client";
import {
  Button,
  Checkbox,
  Field,
  Fieldset,
  Input,
} from "~/components/Controls";
import { H3 } from "~/components/Fonts";
import {
  type UpdateUserFormData,
  updateUserSchema,
} from "~/routes/admin/updateUser/updateUser.schema";

interface UpdateUserFormProps {
  user: KeycloakUser;
  groups: GroupInfo[];
  groupPaths: Set<string>;
}

export const UpdateUserForm = ({
  user,
  groups,
  groupPaths,
}: UpdateUserFormProps) => {
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [memberGroupIds, setMemberGroupIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (groupPaths.has(group.path)) ids.add(group.id);
    }
    return ids;
  });

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

  const onSubmit = (data: UpdateUserFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    for (const group of groups) {
      formData.append(
        `group-${group.id}`,
        String(memberGroupIds.has(group.id)),
      );
    }
    submit(formData, { method: "post" });
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
    <form onSubmit={handleSubmit(onSubmit)} className="">
      <Fieldset>
        <Field label="Account enabled" inline>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={() => field.onChange(!field.value)}
              />
            )}
          />
        </Field>
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
      </Fieldset>

      {groups.length > 0 && (
        <Fieldset>
          <H3>Group Membership</H3>
          {groups.map((group) => (
            <Field key={group.id} label={group.path} inline>
              <Checkbox
                checked={memberGroupIds.has(group.id)}
                onChange={() => toggleGroup(group.id)}
              />
            </Field>
          ))}
        </Fieldset>
      )}

      <footer className="pt-4">
        <Button type="submit" theme="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </footer>
    </form>
  );
};
