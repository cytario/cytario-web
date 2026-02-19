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
  getGroupWithMembers,
  inviteUser,
  type GroupWithMembers,
} from "~/.server/auth/keycloakAdmin";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { Button, Field, Fieldset, Input, Select } from "~/components/Controls";
import { RouteModal } from "~/components/RouteModal";

export const middleware = [authMiddleware];

const inviteSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  firstName: z.string().min(1, "Required").max(255),
  lastName: z.string().min(1, "Required").max(255),
  groupPath: z.string().min(1, "Required").max(255),
});

function flattenGroupPaths(group: GroupWithMembers): string[] {
  return [group.path, ...group.subGroups.flatMap(flattenGroupPaths)];
}

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

  const group = await getGroupWithMembers(authTokens.accessToken, scope);

  return { scope, groupOptions: group ? flattenGroupPaths(group) : [scope] };
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
  const result = inviteSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const isGroupPathAllowed = user.adminScopes.some(
    (s) =>
      result.data.groupPath === s ||
      result.data.groupPath.startsWith(s + "/"),
  );
  if (!isGroupPathAllowed) {
    throw new Response("Not authorized", { status: 403 });
  }

  const session = await getSession(request);

  try {
    await inviteUser(
      authTokens.accessToken,
      result.data.email,
      result.data.firstName,
      result.data.lastName,
      result.data.groupPath,
    );
    session.set("notification", {
      status: "success",
      message: `Invited ${result.data.email} to ${result.data.groupPath}.`,
    });
  } catch (e) {
    console.error("Invite failed:", e);
    session.set("notification", {
      status: "error",
      message: "Failed to invite user.",
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};

export default function InviteModal() {
  const { scope, groupOptions } = useLoaderData<{
    scope: string;
    groupOptions: string[];
  }>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [selectedGroup, setSelectedGroup] = useState(scope);

  return (
    <RouteModal title="Invite User">
      <form method="post" className="space-y-4">
        <Fieldset>
          <Field label="Email" error={fieldError(actionData?.errors, "email")}>
            <Input
              name="email"
              type="email"
              required
              scale="large"
              theme="light"
            />
          </Field>
          <Field
            label="First name"
            error={fieldError(actionData?.errors, "firstName")}
          >
            <Input name="firstName" required scale="large" theme="light" />
          </Field>
          <Field
            label="Last name"
            error={fieldError(actionData?.errors, "lastName")}
          >
            <Input name="lastName" required scale="large" theme="light" />
          </Field>
          <Field label="Group">
            <Select
              options={groupOptions.map((p) => ({ label: p, value: p }))}
              value={selectedGroup}
              onChange={setSelectedGroup}
              name="groupPath"
            />
          </Field>
        </Fieldset>
        <Button type="submit" theme="primary" disabled={isSubmitting}>
          {isSubmitting ? "Inviting..." : "Send Invite"}
        </Button>
      </form>
    </RouteModal>
  );
}
