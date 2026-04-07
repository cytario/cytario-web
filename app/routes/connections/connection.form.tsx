import {
  Field,
  Fieldset,
  FormWizard,
  FormWizardNav,
  FormWizardProgress,
  Input,
  Select,
  SelectItem,
} from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useFetcher } from "react-router";

import AWS_REGIONS from "./awsRegions.json";
import {
  type ConnectBucketFormData,
  connectionSchema,
  defaultFormValues,
  parseS3Uri,
  suggestName,
} from "./connection.schema";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { VisibilityPill } from "~/components/Pills/VisibilityPill";

const STEP_LABELS = ["Storage Type", "Connection Details", "Confirm"];
const LAST_STEP = STEP_LABELS.length - 1;

const providerItems: SelectItem[] = [
  { id: "aws", name: "AWS S3" },
  { id: "minio", name: "MinIO" },
];

const regionItems: SelectItem[] = AWS_REGIONS.map((region) => ({
  id: region.value,
  name: `${region.label} (${region.value})`,
}));

const FIELD_TO_STEP: Record<string, number> = {
  providerType: 0,
  s3Uri: 0,
  name: 0,
  ownerScope: 1,
  roleArn: 1,
  bucketRegion: 1,
  bucketEndpoint: 1,
};

const dtClass = "text-[var(--color-text-secondary)]";
const ddClass =
  "font-[number:var(--font-weight-medium)] text-[var(--color-text-primary)]";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className={dtClass}>{label}</dt>
      <dd className={ddClass}>{value}</dd>
    </div>
  );
}

interface ConnectionFormProps {
  adminScopes: string[];
  userId: string;
  initialData?: ConnectBucketFormData & { originalName: string };
}

export const ConnectionForm = ({
  adminScopes,
  userId,
  initialData,
}: ConnectionFormProps) => {
  const isEditMode = !!initialData;
  const fetcher = useFetcher<{
    errors?: Record<string, string[]>;
    status?: string;
  }>();

  const serverErrors =
    fetcher.data?.status === "error" ? fetcher.data.errors : undefined;
  const isSubmitting = fetcher.state === "submitting";

  // Compute the initial step from server errors so we navigate to the
  // correct page without needing setState inside an effect.
  const initialStep = serverErrors
    ? Object.keys(serverErrors).reduce<number>((acc, field) => {
        const step = FIELD_TO_STEP[field];
        return step !== undefined && step < acc ? step : acc;
      }, LAST_STEP)
    : 0;

  const [currentStep, setCurrentStep] = useState(initialStep);

  const {
    control,
    handleSubmit,
    setError,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<ConnectBucketFormData>({
    resolver: zodResolver(connectionSchema),
    defaultValues: initialData
      ? {
          ...defaultFormValues,
          ...initialData,
          ownerScope: initialData.ownerScope || userId,
        }
      : { ...defaultFormValues, ownerScope: userId },
    mode: "onTouched",
  });

  // Surface server-side errors (e.g. unique name constraint) in the form
  useEffect(() => {
    if (!serverErrors) return;
    for (const [field, messages] of Object.entries(serverErrors)) {
      if (messages?.[0]) {
        setError(field as keyof ConnectBucketFormData, {
          message: messages[0],
        });
      }
    }
  }, [serverErrors, setError]);

  const providerType = useWatch({ control, name: "providerType" });
  const isAWS = providerType === "aws";

  const s3Uri = useWatch({ control, name: "s3Uri" });
  const nameValue = useWatch({ control, name: "name" });
  const bucketRegion = useWatch({ control, name: "bucketRegion" });
  const roleArn = useWatch({ control, name: "roleArn" });
  const bucketEndpoint = useWatch({ control, name: "bucketEndpoint" });

  const userEditedName = useRef(isEditMode);
  const isAutoUpdatingName = useRef(false);

  useEffect(() => {
    if (!userEditedName.current && s3Uri) {
      isAutoUpdatingName.current = true;
      setValue("name", suggestName(s3Uri));
      isAutoUpdatingName.current = false;
    }
  }, [s3Uri, setValue]);

  const fieldsPerStep: Record<number, (keyof ConnectBucketFormData)[]> = {
    0: ["providerType", "s3Uri", "name"],
    1: isAWS
      ? ["ownerScope", "roleArn", "bucketRegion"]
      : ["ownerScope", "bucketEndpoint"],
  };

  const onSubmit = (data: ConnectBucketFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    if (isEditMode) {
      formData.append("_originalName", initialData.originalName);
      fetcher.submit(formData, { method: "PATCH", action: "/connections" });
    } else {
      fetcher.submit(formData, { method: "post", action: "/connections" });
    }
  };

  const handleNext = async () => {
    if (currentStep === LAST_STEP) {
      await handleSubmit(onSubmit)();
      return;
    }
    const fieldsToValidate = fieldsPerStep[currentStep];
    if (!fieldsToValidate) return;
    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && currentStep < LAST_STEP) {
      e.preventDefault();
      handleNext();
    }
  };

  const { bucketName, prefix } = parseS3Uri(s3Uri);

  return (
    <FormWizard
      currentStep={currentStep}
      totalSteps={STEP_LABELS.length}
      onStepChange={setCurrentStep}
    >
      <div className="flex flex-col gap-(--spacing-6)">
        <FormWizardProgress labels={STEP_LABELS} />

        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          className="flex flex-col gap-(--spacing-6)"
          onSubmit={handleSubmit(onSubmit)}
          onKeyDown={handleKeyDown}
        >
          {currentStep === 0 && (
            <Fieldset>
              <Field label="Provider" error={errors.providerType}>
                <Controller
                  name="providerType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      items={providerItems}
                      renderItem={(item) => <ProviderPill provider={item.id} />}
                      selectedKey={field.value}
                      onSelectionChange={(key) => field.onChange(key)}
                    />
                  )}
                />
              </Field>

              <Field
                label="S3 URI"
                description="Bucket name and optional path prefix."
                error={errors.s3Uri}
              >
                <Controller
                  name="s3Uri"
                  control={control}
                  render={({ field }) => (
                    <Input
                      value={field.value}
                      onChange={(val) => {
                        const trimmed = val.replace(/^s3:\/\//, "");
                        field.onChange(trimmed);
                      }}
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
                label="Name"
                description="A friendly name, auto-suggested from the S3 URI."
                error={errors.name}
              >
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input
                      value={field.value}
                      onChange={(val) => {
                        if (!isAutoUpdatingName.current) {
                          userEditedName.current = true;
                        }
                        field.onChange(val);
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      placeholder="my-connection"
                      size="lg"
                    />
                  )}
                />
              </Field>
            </Fieldset>
          )}

          {currentStep === 1 && (
            <Fieldset>
              {adminScopes.length > 0 && (
                <Field
                  label="Visibility"
                  description="Who can access this connection."
                  error={errors.ownerScope}
                >
                  <Controller
                    name="ownerScope"
                    control={control}
                    render={({ field }) => (
                      <Select
                        items={[
                          { id: userId, name: "Personal" },
                          ...adminScopes.map((str) => ({
                            id: str,
                            name: str,
                          })),
                        ]}
                        selectedKey={field.value}
                        onSelectionChange={(key) => field.onChange(key)}
                        renderItem={(item) => (
                          <VisibilityPill scope={item.id} />
                        )}
                      />
                    )}
                  />
                </Field>
              )}

              {isAWS ? (
                <>
                  <Field
                    label="Role ARN"
                    description="IAM role Cytario assumes to access your S3 data."
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

                  <Field
                    label="Region"
                    description="AWS region where this bucket is located."
                    error={errors.bucketRegion}
                  >
                    <Controller
                      name="bucketRegion"
                      control={control}
                      render={({ field }) => (
                        <Select
                          items={regionItems}
                          selectedKey={field.value}
                          onSelectionChange={(key) => field.onChange(key)}
                        />
                      )}
                    />
                  </Field>
                </>
              ) : (
                <Field
                  label="Endpoint"
                  description="Endpoint URL of your S3-compatible storage."
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
                        placeholder="https://s3.cytario.com"
                        size="lg"
                      />
                    )}
                  />
                </Field>
              )}
            </Fieldset>
          )}

          {currentStep === LAST_STEP && (
            <div>
              <p className="mb-(--spacing-2) text-(length:--font-size-sm) font-medium text-(--color-text-primary)">
                Summary
              </p>
              <div
                className={[
                  "rounded-[var(--border-radius-md)]",
                  "border border-[var(--color-border-default)]",
                  "bg-[var(--color-surface-subtle)]",
                  "p-[var(--spacing-4)]",
                ].join(" ")}
              >
                <dl className="flex flex-col gap-[var(--spacing-2)] text-[length:var(--font-size-sm)]">
                  <SummaryRow
                    label="Provider"
                    value={isAWS ? "AWS S3" : "MinIO"}
                  />
                  <SummaryRow label="Name" value={nameValue} />
                  <SummaryRow label="Bucket" value={bucketName} />
                  {prefix && <SummaryRow label="Prefix" value={prefix} />}
                  {isAWS ? (
                    <>
                      <SummaryRow label="Role ARN" value={roleArn ?? ""} />
                      <SummaryRow label="Region" value={bucketRegion ?? ""} />
                    </>
                  ) : (
                    <SummaryRow label="Endpoint" value={bucketEndpoint ?? ""} />
                  )}
                </dl>
              </div>
            </div>
          )}

          <FormWizardNav
            onNext={handleNext}
            isSubmitting={isSubmitting}
            submitLabel={isEditMode ? "Save Changes" : "Connect Storage"}
          />
        </form>
      </div>
    </FormWizard>
  );
};
