import { Field, Fieldset, Input, Select } from "@cytario/design";
import { Control, Controller, FieldErrors } from "react-hook-form";


import AWS_REGIONS from "./awsRegions.json";
import { ConnectBucketFormData } from "./connectBucket.schema";

const regionItems = AWS_REGIONS.map((region) => ({
  id: region.value,
  name: region.value,
}));

export const LocationFieldset = ({
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
        label="S3 URI"
        description="Enter the bucket name and optional path prefix where your whole-slide images are stored (e.g. my-bucket/data/images)."
        error={errors.s3Uri}
      >
        <Controller
          name="s3Uri"
          control={control}
          render={({ field }) => (
            <Input
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              placeholder="my-bucket/path/prefix"
              prefix="s3://"
              size="lg"
            />
          )}
        />
      </Field>

      {isAWS && (
        <Field description="The AWS region where this bucket is located.">
          <Controller
            name="bucketRegion"
            control={control}
            render={({ field }) => (
              <Select
                label="Region"
                items={regionItems}
                selectedKey={field.value}
                onSelectionChange={(key) => field.onChange(key)}
                errorMessage={errors.bucketRegion?.message}
              />
            )}
          />
        </Field>
      )}
    </Fieldset>
  );
};
