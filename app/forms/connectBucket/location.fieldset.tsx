import { UseFormRegister, FieldErrors } from "react-hook-form";

import AWS_REGIONS from "./awsRegions.json";
import { ConnectBucketFormData } from "./connectBucket.schema";
import { Field, Fieldset, Input, Select } from "~/components/Controls";

export const LocationFieldset = ({
  register,
  errors,
}: {
  register: UseFormRegister<ConnectBucketFormData>;
  errors: FieldErrors<ConnectBucketFormData>;
}) => {
  return (
    <Fieldset>
      <Field
        label="S3 URI"
        description="This is the base URL cytario will use to connect to your storage service. Enter the bucket name and optional path where your whole-slide images are stored."
        error={errors.bucketName}
      >
        <Input
          {...register("bucketName")}
          placeholder="my-bucket-name"
          scale="large"
        />
      </Field>

      <Field label="Path Prefix (optional)" description="TODO: deprecate!!!">
        <Input
          {...register("prefix")}
          placeholder="data/experiments"
          scale="large"
        />
      </Field>

      <Field
        label="Region"
        description="The AWS region where this bucket is located."
        error={errors.bucketRegion}
      >
        <Select {...register("bucketRegion")}>
          {AWS_REGIONS.map((region) => (
            <option key={region.value} value={region.value}>
              {region.value}
            </option>
          ))}
        </Select>
      </Field>
    </Fieldset>
  );
};
