import { RadioGroup } from "@headlessui/react";
import {
  Control,
  Controller,
  FieldErrors,
  UseFormRegister,
} from "react-hook-form";

import { ConnectBucketFormData } from "./connectBucket.schema";
import { Field, Fieldset, Input, Radio } from "~/components/Controls";

export const ProviderFieldset = ({
  control,
  register,
  errors,
  isAWS,
}: {
  control: Control<ConnectBucketFormData>;
  register: UseFormRegister<ConnectBucketFormData>;
  errors: FieldErrors<ConnectBucketFormData>;
  isAWS: boolean;
}) => {
  return (
    <Fieldset>
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
              <Radio value="aws">AWS S3</Radio>
              <Radio value="other">Other</Radio>
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
