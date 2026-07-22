import {
  Banner,
  Button,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useActionData, useNavigation, useSubmit } from "react-router";

import {
  type ConnectBucketFormData,
  connectionSchema,
  defaultFormValues,
  suggestName,
} from "./connection.schema";
import { useBucketCatalog } from "./useBucketCatalog";
import { useProviderCatalog } from "./useProviderCatalog";
import { ScopePill } from "~/components/Pills/ScopePill";
import { adminCovers } from "~/utils/authorization";

const STEP_LABELS = ["Storage", "Visibility", "Confirm"];
const LAST_STEP = STEP_LABELS.length - 1;

const FIELD_TO_STEP: Record<string, number> = {
  providerConnectionId: 0,
  bucketName: 0,
  prefix: 0,
  name: 0,
  grants: 1,
};

const stepForField = (field: string): number | undefined => {
  if (FIELD_TO_STEP[field] !== undefined) return FIELD_TO_STEP[field];
  if (field.startsWith("grants.")) return 1;
  return undefined;
};

const dtClass = "text-muted-foreground";
const ddClass = "font-[number:var(--font-weight-medium)] text-foreground";

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
  initialData?: ConnectBucketFormData & { connectionId: string };
  /** Pre-select scope (e.g. from admin page ?scope= param). Falls back to userId. */
  defaultScope?: string;
}

export const ConnectionForm = ({ adminScopes, initialData, defaultScope }: ConnectionFormProps) => {
  const isEditMode = !!initialData;
  const submit = useSubmit();
  const actionData = useActionData<{
    errors?: Record<string, string[]>;
    formError?: string;
    status?: string;
  }>();
  const navigation = useNavigation();
  const { catalog, error: catalogError, loading: catalogLoading } = useProviderCatalog();
  const {
    source: bucketSource,
    catalog: bucketCatalog,
    error: bucketCatalogError,
    loading: bucketCatalogLoading,
  } = useBucketCatalog();

  const serverErrors = actionData?.status === "error" ? actionData.errors : undefined;
  const formError = actionData?.status === "error" ? actionData.formError : undefined;
  const isSubmitting = navigation.state === "submitting";

  const initialStep = serverErrors
    ? Object.keys(serverErrors).reduce<number>((acc, field) => {
        const step = stepForField(field);
        return step !== undefined && step < acc ? step : acc;
      }, LAST_STEP)
    : 0;

  const [currentStep, setCurrentStep] = useState(initialStep);

  const { control, handleSubmit, setError, setValue, trigger } = useForm<ConnectBucketFormData>({
    resolver: zodResolver(connectionSchema),
    defaultValues: initialData
      ? { ...defaultFormValues, ...initialData }
      : {
          ...defaultFormValues,
          grants: [
            {
              scope: defaultScope ?? "",
              providerRoleId: "",
            },
          ],
        },
    mode: "onTouched",
  });

  const { fields, append, remove } = useFieldArray({ control, name: "grants" });

  useEffect(() => {
    if (!serverErrors) return;
    const earliestStep = Object.keys(serverErrors).reduce<number>((acc, field) => {
      const step = stepForField(field);
      return step !== undefined && step < acc ? step : acc;
    }, LAST_STEP);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentStep(earliestStep);
    for (const [field, messages] of Object.entries(serverErrors)) {
      if (messages?.[0]) {
        setError(field as keyof ConnectBucketFormData, { message: messages[0] });
      }
    }
  }, [serverErrors, setError]);

  const providerConnectionId = useWatch({ control, name: "providerConnectionId" });
  const bucketName = useWatch({ control, name: "bucketName" });
  const prefix = useWatch({ control, name: "prefix" });
  const nameValue = useWatch({ control, name: "name" });
  const grantsValue = useWatch({ control, name: "grants" });

  const connectionItems: SelectItem[] = useMemo(
    () =>
      (catalog?.providerConnections ?? []).map((c) => ({
        id: c.id,
        name: c.endpoint
          ? `${c.region} (${c.endpoint})`
          : `${c.providerType.toUpperCase()} ${c.region}`,
      })),
    [catalog],
  );

  const bucketItems: SelectItem[] = useMemo(
    () =>
      (bucketCatalog?.buckets ?? [])
        .filter((b) => b.providerConnectionId === providerConnectionId)
        .map((b) => ({ id: b.bucketName, name: b.bucketName })),
    [bucketCatalog, providerConnectionId],
  );
  const userEditedName = useRef(isEditMode);
  const isAutoUpdatingName = useRef(false);

  useEffect(() => {
    if (!userEditedName.current && bucketName) {
      isAutoUpdatingName.current = true;
      setValue("name", suggestName(bucketName, prefix ?? ""));
      isAutoUpdatingName.current = false;
    }
  }, [bucketName, prefix, setValue]);

  const fieldsPerStep: Record<number, Array<keyof ConnectBucketFormData>> = {
    0: ["providerConnectionId", "bucketName", "prefix", "name"],
    1: ["grants"],
  };

  const onSubmit = (data: ConnectBucketFormData) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("providerConnectionId", data.providerConnectionId);
    formData.append("bucketName", data.bucketName);
    formData.append("prefix", data.prefix ?? "");
    data.grants.forEach((grant, index) => {
      formData.append(`grants[${index}].scope`, grant.scope);
      formData.append(`grants[${index}].providerRoleId`, grant.providerRoleId);
    });
    if (isEditMode) {
      formData.append("connectionId", String(initialData.connectionId));
      submit(formData, { method: "PATCH", action: "/connections" });
    } else {
      submit(formData, { method: "post", action: "/connections" });
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
    if (isValid) setCurrentStep(currentStep + 1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && currentStep < LAST_STEP) {
      e.preventDefault();
      handleNext();
    }
  };

  const scopeItems: SelectItem[] = useMemo(
    () => adminScopes.map((str) => ({ id: str, name: str })),
    [adminScopes],
  );

  const roleItemsForGrant = (grantScope: string): SelectItem[] => {
    const roles = (catalog?.providerRoles ?? []).filter(
      (r) =>
        r.providerConnectionId === providerConnectionId &&
        (r.allowedScopes.length === 0 ||
          !grantScope ||
          r.allowedScopes.some((allowed) => adminCovers(allowed, grantScope))),
    );
    return roles.map((r) => ({ id: r.id, name: r.name }));
  };

  return (
    <FormWizard
      currentStep={currentStep}
      totalSteps={STEP_LABELS.length}
      onStepChange={setCurrentStep}
    >
      <div className="flex flex-col gap-(--spacing-6)">
        <FormWizardProgress labels={STEP_LABELS} />

        {formError && (
          <Banner variant="danger" title="Could not save the connection">
            {formError}
          </Banner>
        )}

        {catalogError && (
          <Banner variant="warning" title="Provider catalog unavailable">
            {catalogError} Existing connections keep working; you cannot compose a new one until the
            catalog is reachable.
          </Banner>
        )}

        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          className="flex flex-col gap-(--spacing-6)"
          onSubmit={handleSubmit(onSubmit)}
          onKeyDown={handleKeyDown}
        >
          {currentStep === 0 && (
            <Fieldset>
              <Controller
                name="providerConnectionId"
                control={control}
                render={({ field, fieldState }) => (
                  <Select
                    label="Provider connection"
                    description="The cloud storage account to connect through."
                    items={connectionItems}
                    isDisabled={catalogLoading || connectionItems.length === 0}
                    selectedKey={field.value || null}
                    onSelectionChange={(key) => {
                      field.onChange(key);
                      setValue("bucketName", "");
                    }}
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                name="bucketName"
                control={control}
                render={({ field, fieldState }) =>
                  bucketSource === "portal" ? (
                    bucketCatalogError ? (
                      <Banner variant="danger" title="Bucket catalog unavailable">
                        {bucketCatalogError} You cannot compose a new connection until the bucket
                        catalog is reachable.
                      </Banner>
                    ) : (
                      <Select
                        label="Bucket"
                        description="Registered buckets under the selected provider connection."
                        items={bucketItems}
                        isDisabled={
                          bucketCatalogLoading || !providerConnectionId || bucketItems.length === 0
                        }
                        selectedKey={field.value || null}
                        onSelectionChange={(key) => field.onChange(key ?? "")}
                        errorMessage={fieldState.error?.message}
                      />
                    )
                  ) : (
                    <Input
                      label="Bucket"
                      description="Name of the S3 bucket."
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      placeholder="my-bucket"
                      size="lg"
                      errorMessage={fieldState.error?.message}
                    />
                  )
                }
              />

              <Controller
                name="prefix"
                control={control}
                render={({ field, fieldState }) => (
                  <Input
                    label="Prefix"
                    description="Optional path prefix within the bucket."
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    placeholder="path/prefix"
                    size="lg"
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                  <Input
                    label="Name"
                    description="A friendly name, auto-suggested from the bucket."
                    value={field.value}
                    onChange={(val) => {
                      if (!isAutoUpdatingName.current) userEditedName.current = true;
                      field.onChange(val);
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                    placeholder="my-connection"
                    size="lg"
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />
            </Fieldset>
          )}

          {currentStep === 1 && (
            <Fieldset>
              <div className="flex flex-col gap-(--spacing-4)">
                {fields.map((field, index) => {
                  const grant = grantsValue?.[index];
                  const grantScope = grant?.scope ?? "";
                  const grantRoleId = grant?.providerRoleId ?? "";
                  const roleItems = roleItemsForGrant(grantScope);
                  const grantError = serverErrors?.[`grants.${index}.providerRoleId`]?.[0];
                  return (
                    <div
                      key={field.id}
                      className="flex flex-col gap-(--spacing-2) rounded-[var(--border-radius-md)] border border-border p-[var(--spacing-3)]"
                    >
                      <Controller
                        name={`grants.${index}.scope` as const}
                        control={control}
                        render={({ field: scopeField, fieldState: scopeFieldState }) => (
                          <Select
                            label={index === 0 ? "Share with group" : undefined}
                            description={
                              index === 0 ? "Who can access this connection." : undefined
                            }
                            items={scopeItems}
                            selectedKey={scopeField.value || null}
                            onSelectionChange={(key) => scopeField.onChange(key)}
                            renderItem={(item) => <ScopePill scope={item.id} />}
                            errorMessage={scopeFieldState.error?.message}
                          />
                        )}
                      />

                      <Controller
                        name={`grants.${index}.providerRoleId` as const}
                        control={control}
                        render={({ field: roleField, fieldState: roleFieldState }) => (
                          <Select
                            label="Provider role"
                            description="The role Cytario assumes to access your data."
                            items={roleItems}
                            isDisabled={!providerConnectionId || roleItems.length === 0}
                            selectedKey={grantRoleId || null}
                            onSelectionChange={(key) => roleField.onChange(key)}
                            errorMessage={roleFieldState.error?.message ?? grantError}
                          />
                        )}
                      />

                      {fields.length > 1 && (
                        <Button
                          variant="ghost"
                          type="button"
                          onPress={() => remove(index)}
                          className="self-start"
                        >
                          Remove grant
                        </Button>
                      )}
                    </div>
                  );
                })}

                <Button
                  variant="ghost"
                  type="button"
                  onPress={() => append({ scope: "", providerRoleId: "" })}
                  className="self-start"
                >
                  Add grant
                </Button>

                {adminScopes.length === 0 && (
                  <p className="text-(length:--font-size-sm) text-muted-foreground">
                    You have no admin scopes — ask an administrator to grant you group access.
                  </p>
                )}
              </div>
            </Fieldset>
          )}

          {currentStep === LAST_STEP && (
            <div>
              <p className="mb-(--spacing-2) text-(length:--font-size-sm) font-medium text-foreground">
                Summary
              </p>
              <div
                className={[
                  "rounded-[var(--border-radius-md)]",
                  "border border-border",
                  "bg-card",
                  "p-[var(--spacing-4)]",
                ].join(" ")}
              >
                <dl className="flex flex-col gap-[var(--spacing-2)] text-[length:var(--font-size-sm)]">
                  <SummaryRow label="Name" value={nameValue ?? ""} />
                  <SummaryRow label="Bucket" value={bucketName ?? ""} />
                  {prefix && <SummaryRow label="Prefix" value={prefix} />}
                  <div className="flex flex-col gap-[var(--spacing-1)]">
                    <dt className={dtClass}>Grants</dt>
                    {(grantsValue ?? []).map((grant, i) => (
                      <dd key={i} className={ddClass}>
                        {grant.scope}
                        {grant.providerRoleId
                          ? ` — ${
                              catalog?.providerRoles.find((r) => r.id === grant.providerRoleId)
                                ?.name ?? grant.providerRoleId
                            }`
                          : ""}
                      </dd>
                    ))}
                  </div>
                </dl>
              </div>
            </div>
          )}

          <FormWizardNav
            onNext={handleNext}
            isSubmitting={isSubmitting}
            submitLabel={isEditMode ? "Save Changes" : "Add Connection"}
          />
        </form>
      </div>
    </FormWizard>
  );
};
