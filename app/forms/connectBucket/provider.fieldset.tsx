import { Field, Fieldset, Input, RadioButton, RadioGroup, Select } from "@cytario/design";
import { Control, Controller, FieldErrors } from "react-hook-form";

import { ConnectBucketFormData } from "./connectBucket.schema";

export const ProviderFieldset = ({
  control,
  errors,
  isAWS,
  adminScopes,
  userId,
}: {
  control: Control<ConnectBucketFormData>;
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
                label="Visibility"
                items={[
                  { id: userId, name: "Personal" },
                  ...adminScopes.map((str) => ({ id: str, name: str })),
                ]}
                selectedKey={field.value}
                onSelectionChange={(key) => field.onChange(key)}
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
