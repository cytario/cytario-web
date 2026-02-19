import { useState } from "react";
import {
  type ActionFunction,
  type LoaderFunction,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  type KeycloakUser,
  updateUser,
} from "~/.server/auth/keycloakAdmin";
import { adminFetch } from "~/.server/auth/keycloakAdmin/client";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import {
  Button,
  Field,
  Fieldset,
  Input,
  Switch,
} from "~/components/Controls";
import { RouteModal } from "~/components/RouteModal";

export const middleware = [authMiddleware];

const updateUserSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  firstName: z.string().min(1, "Required").max(255),
  lastName: z.string().min(1, "Required").max(255),
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});

function fieldError(
  errors: Record<string, string[]> | undefined,
  field: string,
) {
  const msg = errors?.[field]?.[0];
  return msg ? { message: msg, type: "server" } : undefined;
}

export const loader: LoaderFunction = async ({ context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = params.group ? `${params.org}/${params.group}` : params.org!;

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const keycloakUser = await adminFetch<KeycloakUser>(
    authTokens.accessToken,
    `/users/${params.userId}`,
  );

  return { user: keycloakUser, scope };
};

type ActionData = {
  errors?: Record<string, string[]>;
};

export const action: ActionFunction = async ({ request, context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = params.group ? `${params.org}/${params.group}` : params.org!;
  const adminUrl = `/admin/${scope}`;

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const formData = await request.formData();
  const result = updateUserSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const session = await getSession(request);

  try {
    await updateUser(authTokens.accessToken, params.userId!, result.data);
    session.set("notification", {
      status: "success",
      message: "User updated successfully.",
    });
  } catch (e) {
    console.error("Update user failed:", e);
    session.set("notification", {
      status: "error",
      message: "Failed to update user.",
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};

export default function UserModal() {
  const { user: keycloakUser } = useLoaderData<{
    user: KeycloakUser;
    scope: string;
  }>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [enabled, setEnabled] = useState(keycloakUser.enabled);

  return (
    <RouteModal title="Edit User">
      <form method="post" className="space-y-4">
        <Fieldset>
          <Field label="Email" error={fieldError(actionData?.errors, "email")}>
            <Input
              name="email"
              type="email"
              defaultValue={keycloakUser.email}
              required
              scale="large"
              theme="light"
            />
          </Field>
          <Field
            label="First name"
            error={fieldError(actionData?.errors, "firstName")}
          >
            <Input
              name="firstName"
              defaultValue={keycloakUser.firstName}
              required
              scale="large"
              theme="light"
            />
          </Field>
          <Field
            label="Last name"
            error={fieldError(actionData?.errors, "lastName")}
          >
            <Input
              name="lastName"
              defaultValue={keycloakUser.lastName}
              required
              scale="large"
              theme="light"
            />
          </Field>
          <Field label="Account enabled">
            <div className="flex items-center gap-3">
              <Switch checked={enabled} onChange={() => setEnabled((v) => !v)} />
              <span className="text-sm text-slate-600">
                {enabled ? "Active" : "Disabled"}
              </span>
            </div>
          </Field>
        </Fieldset>
        <input type="hidden" name="enabled" value={String(enabled)} />
        <Button type="submit" theme="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </RouteModal>
  );
}
