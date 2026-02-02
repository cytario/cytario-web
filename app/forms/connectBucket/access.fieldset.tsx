import { UseFormRegister, FieldErrors } from "react-hook-form";

import { ConnectBucketFormData } from "./connectBucket.schema";
import { Field, Fieldset, Input } from "~/components/Controls";

export const AccessFieldset = ({
  register,
  errors,
  isAWS,
}: {
  register: UseFormRegister<ConnectBucketFormData>;
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
          <Input
            {...register("roleArn")}
            placeholder="arn:aws:iam::123456789012:role/MyRole"
            scale="large"
          />
        </Field>
      ) : (
        <Field
          label="Endpoint"
          description="The endpoint URL of your S3-compatible storage. This is the base URL cytario will use to connect to your storage service."
          error={errors.bucketEndpoint}
        >
          <Input
            {...register("bucketEndpoint")}
            placeholder="http://localhost:9000"
            scale="large"
          />
        </Field>
      )}
    </Fieldset>
  );
};
