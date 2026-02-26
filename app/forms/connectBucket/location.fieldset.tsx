import {
  Control,
  Controller,
  FieldErrors,
  UseFormRegister,
} from "react-hook-form";

import AWS_REGIONS from "./awsRegions.json";
import { ConnectBucketFormData } from "./connectBucket.schema";
import { Field, Fieldset, Input, Select } from "~/components/Controls";

export const LocationFieldset = ({
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
          <Controller
            name="bucketRegion"
            control={control}
            render={({ field }) => (
              <Select
                options={AWS_REGIONS.map(({ value }) => ({
                  label: value,
                  value,
                }))}
                value={field.value ?? ""}
                onChange={field.onChange}
                name={field.name}
              />
            )}
          />
        </Field>
      )}
    </Fieldset>
  );
};
