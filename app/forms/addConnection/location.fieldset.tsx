import { Field, Fieldset, Input, Select } from "@cytario/design";
import { useEffect, useRef } from "react";
import { Control, Controller, FieldErrors, useWatch } from "react-hook-form";

import { ConnectBucketFormData, suggestAlias } from "./addConnection.schema";
import AWS_REGIONS from "./awsRegions.json";

const regionItems = AWS_REGIONS.map((region) => ({
  id: region.value,
  name: region.value,
}));

export const LocationFieldset = ({
  control,
  errors,
  isAWS,
  setValue,
}: {
  control: Control<ConnectBucketFormData>;
  errors: FieldErrors<ConnectBucketFormData>;
  isAWS: boolean;
  setValue: (name: keyof ConnectBucketFormData, value: string) => void;
}) => {
  const s3Uri = useWatch({ control, name: "s3Uri" });
  const userEditedAlias = useRef(false);

  // Auto-suggest alias when S3 URI changes (unless user manually edited it)
  useEffect(() => {
    if (!userEditedAlias.current && s3Uri) {
      setValue("alias", suggestAlias(s3Uri));
    }
  }, [s3Uri, setValue]);

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

      <Field
        label="Connection Alias"
        description="A unique, URL-friendly identifier for this connection (e.g. my-bucket or my-bucket-deliverables)."
        error={errors.alias}
      >
        <Controller
          name="alias"
          control={control}
          render={({ field }) => (
            <Input
              value={field.value}
              onChange={(val) => {
                userEditedAlias.current = true;
                field.onChange(val);
              }}
              onBlur={field.onBlur}
              name={field.name}
              placeholder="my-connection-alias"
              size="lg"
            />
          )}
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
