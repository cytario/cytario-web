import { Field, Fieldset, Input } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSubmit } from "react-router";

import {
  type CreateGroupFormData,
  createGroupSchema,
} from "./createGroup.schema";
import { ScopePill } from "~/components/Pills/ScopePill";

interface CreateGroupFormProps {
  scope: string;
}

export function CreateGroupForm({ scope }: CreateGroupFormProps) {
  const submit = useSubmit();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateGroupFormData>({
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
    <form
      id="create-group-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Fieldset>
        <Field label="Group name" error={errors.name}>
          <Controller
            control={control}
            name="name"
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
      </Fieldset>

      {nameValue.trim() && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          Full path: <ScopePill scope={`${scope}/${nameValue.trim()}`} />
        </div>
      )}

      <p className="text-sm text-slate-500">
        You will be added as an admin of this group automatically.
      </p>
    </form>
  );
}
