import { Fieldset, Input } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSubmit } from "react-router";

import { type CreateGroupFormData, createGroupSchema } from "./createGroup.schema";
import { ScopePill } from "~/components/Pills/ScopePill";

interface CreateGroupFormProps {
  scope: string;
}

export function CreateGroupForm({ scope }: CreateGroupFormProps) {
  const submit = useSubmit();

  const { control, handleSubmit } = useForm<CreateGroupFormData>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: "" },
    mode: "onBlur",
  });

  const nameValue = useWatch({ control, name: "name" });

  const onSubmit = (data: CreateGroupFormData) => {
    const formData = new FormData();
    formData.append("name", data.name);
    submit(formData, { method: "post" });
  };

  return (
    <form id="create-group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Fieldset>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <Input
              label="Group name"
              size="lg"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
      </Fieldset>

      {nameValue.trim() && (
        <div className="flex items-center gap-2 text-sm text-(--color-text-tertiary)">
          Full path: <ScopePill scope={`${scope}/${nameValue.trim()}`} />
        </div>
      )}

      <p className="text-sm text-(--color-text-tertiary)">
        You will be added as an admin of this group automatically.
      </p>
    </form>
  );
}
