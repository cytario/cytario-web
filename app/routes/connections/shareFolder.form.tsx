import { Banner, Button, Fieldset, Input, Select, SelectItem } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useActionData, useLocation, useNavigation, useSubmit } from "react-router";

import { GrantLevelHint, grantLevelHint, levelsForGrant } from "./grantLevels";
import { type ShareFolderFormData, shareFolderSchema } from "./shareFolder.schema";
import { useBucketCatalog } from "./useBucketCatalog";
import { useProviderCatalog } from "./useProviderCatalog";
import { ScopePill } from "~/components/Pills/ScopePill";
import { useOrgPath } from "~/hooks/useOrgPath";
import { type AccessLevel } from "~/utils/providerCatalog.schema";

const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  "read-only": "Read Only",
  annotate: "Annotate",
  "read-write": "Read Write",
  admin: "Admin",
};

interface ShareFolderFormProps {
  adminScopes: string[];
  bucketName: string;
  providerConnectionId: string;
  prefix: string;
  onClose: () => void;
}

/**
 * Share Folder form: a name plus a grants-list repeating group — each row a
 * group scope + access level — over the fixed folder context
 * (bucket / provider connection / prefix, submitted as hidden fields). The
 * storage role for each level is resolved server-side; level selector filtering
 * is advisory and the server re-validates every submitted value.
 */
export const ShareFolderForm = ({
  adminScopes,
  bucketName,
  providerConnectionId,
  prefix,
  onClose,
}: ShareFolderFormProps) => {
  const submit = useSubmit();
  const navigation = useNavigation();
  const connectionsPath = useOrgPath()("/connections");
  const { catalog, error: catalogError, loading: catalogLoading } = useProviderCatalog();
  const { catalog: bucketCatalog } = useBucketCatalog();
  const actionData = useActionData<{
    errors?: Record<string, string[]>;
    formError?: string;
    status?: string;
  }>();

  const serverErrors = actionData?.status === "error" ? actionData.errors : undefined;
  const formError = actionData?.status === "error" ? actionData.formError : undefined;
  const isSubmitting = navigation.state === "submitting";
  const location = useLocation();

  const { control, handleSubmit, setError } = useForm<ShareFolderFormData>({
    resolver: zodResolver(shareFolderSchema),
    defaultValues: {
      name: "",
      bucketName,
      providerConnectionId,
      prefix,
      grants: [{ scope: adminScopes[0] ?? "", accessLevel: "read-only" as const }],
    },
    mode: "onTouched",
  });

  const { fields, append, remove } = useFieldArray({ control, name: "grants" });

  useEffect(() => {
    if (!serverErrors) return;
    for (const [field, messages] of Object.entries(serverErrors)) {
      if (messages?.[0]) setError(field as keyof ShareFolderFormData, { message: messages[0] });
    }
  }, [serverErrors, setError]);

  const grantsValue = useWatch({ control, name: "grants" });

  const scopeItems: SelectItem[] = useMemo(
    () => adminScopes.map((s) => ({ id: s, name: s })),
    [adminScopes],
  );

  const bucketRowId = useMemo(
    () =>
      (bucketCatalog?.buckets ?? []).find(
        (b) => b.providerConnectionId === providerConnectionId && b.bucketName === bucketName,
      )?.id,
    [bucketCatalog, providerConnectionId, bucketName],
  );

  const onSubmit = (data: ShareFolderFormData) => {
    const formData = new FormData();
    formData.append("_intent", "share");
    formData.append("name", data.name);
    formData.append("bucketName", data.bucketName);
    formData.append("providerConnectionId", data.providerConnectionId);
    formData.append("prefix", data.prefix ?? "");
    data.grants.forEach((grant, index) => {
      formData.append(`grants[${index}].scope`, grant.scope);
      formData.append(`grants[${index}].accessLevel`, grant.accessLevel);
    });
    // An explicit action path resolves without the current search params, so
    // the modal's `?modal=` param would be dropped and the dialog unmounted
    // mid-submit — its error banner would never render. Preserve the search.
    submit(formData, { method: "post", action: `${connectionsPath}${location.search}` });
  };

  return (
    <form className="flex flex-col gap-(--spacing-6)" onSubmit={handleSubmit(onSubmit)}>
      {formError && (
        <Banner variant="danger" title="Could not share the folder">
          {formError}
        </Banner>
      )}
      {catalogError && (
        <Banner variant="warning" title="Provider catalog unavailable">
          {catalogError}
        </Banner>
      )}

      <Fieldset>
        <div className="text-(length:--font-size-sm) text-muted-foreground">
          Sharing <span className="font-medium text-foreground">{bucketName}</span>
          {prefix ? `/${prefix}` : ""}
        </div>

        <Controller
          name="name"
          control={control}
          render={({ field, fieldState }) => (
            <Input
              label="Name"
              description="A name for this share."
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              placeholder="team-a shared folder"
              size="lg"
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <div className="flex flex-col gap-(--spacing-4)">
          {fields.map((field, index) => {
            const grant = grantsValue?.[index];
            const grantScope = grant?.scope ?? "";
            const grantLevel = grant?.accessLevel ?? "";
            const grantError = serverErrors?.[`grants.${index}.accessLevel`]?.[0];
            const hint = grantLevelHint(
              { catalog, loading: catalogLoading, error: catalogError },
              providerConnectionId,
              grantScope,
              bucketRowId,
            );
            const levelItems: SelectItem[] = levelsForGrant(
              catalog,
              providerConnectionId,
              grantScope,
              bucketRowId,
            ).map((level) => ({
              id: level,
              name: ACCESS_LEVEL_LABELS[level],
            }));
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
                        index === 0 ? "The target group that will gain access." : undefined
                      }
                      items={scopeItems}
                      selectedKey={scopeField.value || null}
                      onSelectionChange={(key) => scopeField.onChange(key)}
                      renderItem={(item) => <ScopePill scope={item.id} />}
                      errorMessage={scopeFieldState.error?.message}
                    />
                  )}
                />

                <div
                  className={["flex flex-col gap-(--spacing-2)", hint ? "opacity-60" : ""].join(
                    " ",
                  )}
                >
                  <Controller
                    name={`grants.${index}.accessLevel` as const}
                    control={control}
                    render={({ field: levelField, fieldState: levelFieldState }) => (
                      <Select
                        label="Access level"
                        description="The permissions this group gets on the data."
                        items={levelItems}
                        isDisabled={hint !== undefined}
                        selectedKey={grantLevel || null}
                        onSelectionChange={(key) => levelField.onChange(key)}
                        errorMessage={levelFieldState.error?.message ?? grantError}
                      />
                    )}
                  />
                  {hint && <GrantLevelHint hint={hint} />}
                </div>

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
            onPress={() =>
              append({ scope: adminScopes[0] ?? "", accessLevel: "read-only" as const })
            }
            className="self-start"
          >
            Add grant
          </Button>
        </div>
      </Fieldset>

      <div className="flex justify-end gap-(--spacing-2)">
        <Button variant="ghost" type="button" onPress={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" isDisabled={isSubmitting}>
          Share
        </Button>
      </div>
    </form>
  );
};
