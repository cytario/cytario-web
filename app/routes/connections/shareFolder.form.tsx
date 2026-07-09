import { Banner, Button, Fieldset, Input, Select, SelectItem } from "@cytario/design";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useActionData, useNavigation, useSubmit } from "react-router";

import { type ShareFolderFormData, shareFolderSchema } from "./shareFolder.schema";
import { useProviderCatalog } from "./useProviderCatalog";
import { ScopePill } from "~/components/Pills/ScopePill";
import { adminCovers } from "~/utils/authorization";

interface ShareFolderFormProps {
  adminScopes: string[];
  bucketName: string;
  providerConnectionId: string;
  prefix: string;
  onClose: () => void;
}

/**
 * Share Folder form: three editable fields — name, target group
 * scope, provider role — over the fixed folder context (bucket / provider
 * connection / prefix, submitted as hidden fields). Role/group selector filtering
 * is advisory; the server re-authorizes the submitted scope.
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
  const { catalog, error: catalogError } = useProviderCatalog();
  const actionData = useActionData<{
    errors?: Record<string, string[]>;
    formError?: string;
    status?: string;
  }>();

  const serverErrors = actionData?.status === "error" ? actionData.errors : undefined;
  const formError = actionData?.status === "error" ? actionData.formError : undefined;
  const isSubmitting = navigation.state === "submitting";

  const { control, handleSubmit, setError } = useForm<ShareFolderFormData>({
    resolver: zodResolver(shareFolderSchema),
    defaultValues: {
      name: "",
      scope: adminScopes[0] ?? "",
      providerRoleId: "",
      bucketName,
      providerConnectionId,
      prefix,
    },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!serverErrors) return;
    for (const [field, messages] of Object.entries(serverErrors)) {
      if (messages?.[0]) setError(field as keyof ShareFolderFormData, { message: messages[0] });
    }
  }, [serverErrors, setError]);

  const scope = useWatch({ control, name: "scope" });

  // Advisory: offer only sharing-capable roles on this provider connection whose
  // allowed scopes cover the chosen target group.
  const roleItems: SelectItem[] = useMemo(() => {
    const roles = (catalog?.providerRoles ?? []).filter(
      (r) =>
        r.providerConnectionId === providerConnectionId &&
        r.allowsSharing &&
        (!scope || r.allowedScopes.some((allowed) => adminCovers(allowed, scope))),
    );
    return roles.map((r) => ({ id: r.id, name: r.name }));
  }, [catalog, providerConnectionId, scope]);

  const onSubmit = (data: ShareFolderFormData) => {
    const formData = new FormData();
    formData.append("_intent", "share");
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, String(value));
    });
    submit(formData, { method: "post", action: "/connections" });
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

        <Controller
          name="scope"
          control={control}
          render={({ field, fieldState }) => (
            <Select
              label="Share with group"
              description="The target group that will gain access."
              items={adminScopes.map((s) => ({ id: s, name: s }))}
              selectedKey={field.value || null}
              onSelectionChange={(key) => field.onChange(key)}
              renderItem={(item) => <ScopePill scope={item.id} />}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <Controller
          name="providerRoleId"
          control={control}
          render={({ field, fieldState }) => (
            <Select
              label="Provider role"
              description="A sharing-capable role covering the chosen group."
              items={roleItems}
              isDisabled={roleItems.length === 0}
              selectedKey={field.value || null}
              onSelectionChange={(key) => field.onChange(key)}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
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
