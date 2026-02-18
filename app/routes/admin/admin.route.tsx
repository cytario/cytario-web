import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { useState } from "react";
import {
  type ActionFunction,
  type LoaderFunction,
  type MetaFunction,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  getGroupWithMembers,
  inviteUser,
  type GroupWithMembers,
} from "~/.server/auth/keycloakAdmin";
import { Section } from "~/components/Container";
import {
  Button,
  Field,
  Fieldset,
  IconButton,
  Input,
  Select,
} from "~/components/Controls";

const title = "Admin";

export const meta: MetaFunction = () => {
  return [{ title }];
};

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

export const action: ActionFunction = async ({ request, context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = params["*"] ?? "";

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    return { error: "Not authorized" };
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
    return { error: "Not authorized for this group" };
  }

  try {
    await inviteUser(
      authTokens.accessToken,
      result.data.email,
      result.data.firstName,
      result.data.lastName,
      result.data.groupPath,
    );
    return { success: true };
  } catch (e) {
    console.error("Invite failed:", e);
    return { error: "Failed to invite user" };
  }
};

export const loader: LoaderFunction = async ({ context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = params["*"] ?? "";

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );

  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const group = await getGroupWithMembers(authTokens.accessToken, scope);

  return { scope, group };
};

function GroupSection({
  group,
  depth = 0,
}: {
  group: GroupWithMembers;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-6 mt-4" : ""}>
      <h2 className="font-bold text-lg">{group.path}</h2>

      {group.members.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {group.members.map((m) => (
            <li key={m.id} className="flex gap-2 text-sm">
              <span className="font-medium">
                {m.firstName} {m.lastName}
              </span>
              <span className="text-slate-500">{m.email}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400 mt-1">No direct members</p>
      )}

      {group.subGroups.map((sg) => (
        <GroupSection key={sg.path} group={sg} depth={depth + 1} />
      ))}
    </div>
  );
}

type ActionData = {
  success?: boolean;
  error?: string;
  errors?: Record<string, string[]>;
};

function fieldError(errors: Record<string, string[]> | undefined, field: string) {
  const msg = errors?.[field]?.[0];
  return msg ? { message: msg, type: "server" } : undefined;
}

function InviteDialog({
  open,
  onClose,
  groupOptions,
  defaultGroup,
}: {
  open: boolean;
  onClose: () => void;
  groupOptions: string[];
  defaultGroup: string;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<ActionData>();
  const isSubmitting = navigation.state === "submitting";
  const [selectedGroup, setSelectedGroup] = useState(defaultGroup);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("groupPath", selectedGroup);
    submit(formData, { method: "post" });
  };

  if (actionData?.success && open) {
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-300 text-slate-900">
          <header className="flex items-center justify-between p-4 bg-slate-100 border-b border-slate-300 rounded-t-xl">
            <DialogTitle className="text-xl font-bold">Invite User</DialogTitle>
            <IconButton
              onClick={onClose}
              icon="X"
              label="Close"
              theme="transparent"
            />
          </header>
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <Fieldset>
              <Field
                label="Email"
                error={fieldError(actionData?.errors, "email")}
              >
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
            {actionData?.error && (
              <p className="text-sm text-rose-700">{actionData.error}</p>
            )}
            <Button type="submit" theme="primary" disabled={isSubmitting}>
              {isSubmitting ? "Inviting..." : "Send Invite"}
            </Button>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default function AdminRoute() {
  const { scope, group } = useLoaderData<{
    scope: string;
    group?: GroupWithMembers;
  }>();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <Section>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-bold text-2xl">{scope}</h1>
          <Button theme="primary" onClick={() => setInviteOpen(true)}>
            Invite User
          </Button>
        </div>
        {group ? (
          <GroupSection group={group} />
        ) : (
          <p className="text-slate-500">Group not found.</p>
        )}
        {group && (
          <InviteDialog
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            groupOptions={flattenGroupPaths(group)}
            defaultGroup={scope}
          />
        )}
      </div>
    </Section>
  );
}
