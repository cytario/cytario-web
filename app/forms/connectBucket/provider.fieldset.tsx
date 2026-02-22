import { Field, Fieldset, Input, RadioButton, RadioGroup } from "@cytario/design";
import { Control, Controller, FieldErrors } from "react-hook-form";


import { ConnectBucketFormData } from "./connectBucket.schema";

export const ProviderFieldset = ({
  control,
  errors,
  isAWS,
}: {
  control: Control<ConnectBucketFormData>;
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
              aria-label="Storage provider"
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
          <Controller
            name="provider"
            control={control}
            render={({ field }) => (
              <Input
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                placeholder="minio"
                size="lg"
              />
            )}
          />
        </Field>
      )}
    </Fieldset>
  );
};
