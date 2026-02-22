import { Field, Fieldset, Input } from "@cytario/design";
import { Control, Controller, FieldErrors } from "react-hook-form";


import { ConnectBucketFormData } from "./connectBucket.schema";

export const AccessFieldset = ({
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
      {isAWS ? (
        <Field
          label="Role ARN"
          description="The IAM role Cytario will assume to access your S3 data. The role must grant read access to the specified bucket and path. Cytario uses temporary credentials and does not store long-term secrets."
          error={errors.roleArn}
        >
          <Controller
            name="roleArn"
            control={control}
            render={({ field }) => (
              <Input
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                placeholder="arn:aws:iam::123456789012:role/MyRole"
                size="lg"
              />
            )}
          />
        </Field>
      ) : (
        <Field
          label="Endpoint"
          description="The endpoint URL of your S3-compatible storage. This is the base URL cytario will use to connect to your storage service."
          error={errors.bucketEndpoint}
        >
          <Controller
            name="bucketEndpoint"
            control={control}
            render={({ field }) => (
              <Input
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                placeholder="http://localhost:9000"
                size="lg"
              />
            )}
          />
        </Field>
      )}
    </Fieldset>
  );
};
