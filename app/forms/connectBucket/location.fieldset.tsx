import { UseFormRegister, FieldErrors } from "react-hook-form";

import AWS_REGIONS from "./awsRegions.json";
import { ConnectBucketFormData } from "./connectBucket.schema";
import { Field, Fieldset, Input, Select } from "~/components/Controls";

export const LocationFieldset = ({
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
      <Field
        label="S3 URI"
        description="Enter the bucket name and optional path prefix where your whole-slide images are stored (e.g. my-bucket/data/images)."
        error={errors.s3Uri}
      >
        <Input
          {...register("s3Uri")}
          placeholder="my-bucket/path/prefix"
          prefix="s3://"
          scale="large"
        />
      </Field>

      {isAWS && (
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
      )}
    </Fieldset>
  );
};
