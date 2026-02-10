import { RadioGroup } from "@headlessui/react";
import React from "react";
import {
  Control,
  Controller,
  FieldErrors,
  UseFormRegister,
} from "react-hook-form";

import { ConnectBucketFormData } from "./connectBucket.schema";
import {
  Field,
  Fieldset,
  Input,
  RadioButton,
  Select,
} from "~/components/Controls";

export const ProviderFieldset = ({
  control,
  register,
  errors,
  isAWS,
  adminScopes,
  userId,
}: {
  control: Control<ConnectBucketFormData>;
  register: UseFormRegister<ConnectBucketFormData>;
  errors: FieldErrors<ConnectBucketFormData>;
  isAWS: boolean;
  adminScopes?: string[];
  userId: string;
}) => {
  return (
    <Fieldset>
      <Field
        label="Visibility"
        description="Choose who can access this storage connection. Personal connections are only visible to you. Group connections are shared with all group members."
        error={errors.ownerScope}
      >
        {adminScopes && adminScopes.length > 0 && (
          <Controller
            name="ownerScope"
            control={control}
            render={({ field }) => (
              <Select
                options={[
                  { label: "Personal", value: userId },
                  ...adminScopes.map((str) => ({ label: str, value: str })),
                ]}
                value={field.value}
                onChange={field.onChange}
                name={field.name}
              />
            )}
          />
        )}
      </Field>
      <Field
        label="Provider"
        description="Choose the type of cloud storage you want to connect. Cytario supports
          AWS S3 and S3-compatible object storage."
      >
        <Controller
          name="providerType"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onChange={field.onChange}
              className="flex gap-4"
            >
              <RadioButton value="aws">AWS S3</RadioButton>
              <RadioButton value="other">Other</RadioButton>
            </RadioGroup>
          )}
        />
      </Field>

      {!isAWS && (
        <Field
          label="Provider Name"
          description="A user-friendly name to identify this storage connection."
          error={errors.provider}
        >
          <Input {...register("provider")} placeholder="minio" scale="large" />
        </Field>
      )}
    </Fieldset>
  );
};
