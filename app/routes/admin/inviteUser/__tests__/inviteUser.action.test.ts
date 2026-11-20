import { beforeEach, describe, expect, test, vi } from "vitest";

import { inviteUserAction } from "../inviteUser.action";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";

const commitSession = vi.fn();
const sessionSet = vi.fn();

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn().mockResolvedValue({
    set: (...args: unknown[]) => sessionSet(...args),
    get: vi.fn(),
  }),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: { commitSession: (...args: unknown[]) => commitSession(...args) },
}));

vi.mock("~/.server/auth/getUserInfo", () => ({
  toIdentity: vi.fn((u: unknown) => u),
}));

vi.mock("~/.server/auth/keycloakAdmin", () => ({
  inviteOrganizationUser: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  findGroupPathInTree: vi.fn(),
}));

vi.mock("~/.server/auth/keycloakAdmin/client", () => ({
  KeycloakAdminError: class extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("~/.server/auth/pendingGroupAssignments", () => ({
  createPendingGroupAssignments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/.server/userManagementGate", () => ({
  consultUserMgmtGate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../assertGroupsInScope", () => ({
  assertGroupsInScope: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../assertAdminScope", () => ({
  assertGrantScope: vi.fn(),
}));

const { getSession } = await import("~/.server/auth/getSession");
const { inviteOrganizationUser, findGroupPathInTree } =
  await import("~/.server/auth/keycloakAdmin");
const { createPendingGroupAssignments } = await import("~/.server/auth/pendingGroupAssignments");
const { consultUserMgmtGate } = await import("~/.server/userManagementGate");
const { assertGroupsInScope } = await import("../../assertGroupsInScope");
const { assertGrantScope } = await import("../../assertAdminScope");
const { KeycloakAdminError } = await import("~/.server/auth/keycloakAdmin/client");

const adminUser = {
  sub: "admin-1",
  email: "admin@example.com",
  organizations: { acme: { groups: ["customers/admins"], attributes: {} } },
};

// authContext now carries the request org and the derived per-org entitlements.
const authContextValue = {
  user: adminUser,
  requestOrganization: "acme",
  entitlements: { groups: ["customers"], adminScopes: ["customers"], attributes: {} },
};

function runContext() {
  return {
    get: (ctx: unknown) => {
      if (ctx === authContext) return authContextValue;
      if (ctx === adminContext) {
        return {
          org: { id: "org-1", alias: "acme" },
          adminUrl: "/admin/users?scope=customers",
          scope: "customers",
        };
      }
      return undefined;
    },
  };
}

function formRequest(body: Record<string, string | string[]>): Request {
  return new Request("http://localhost/admin/users/invite?scope=customers", {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(body)) {
        for (const entry of Array.isArray(value) ? value : [value]) {
          formData.append(key, entry);
        }
      }
      return formData;
    })(),
  });
}

function conflict() {
  return new (KeycloakAdminError as new (status: number, message: string) => Error)(
    409,
    "conflict",
  );
}

const scopedGroup = [{ id: "g1", name: "vericura", path: "/customers/vericura", subGroups: [] }];

describe("inviteUserAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSession).mockResolvedValue({ set: sessionSet, get: vi.fn() } as never);
    vi.mocked(findGroupPathInTree).mockImplementation((_tree, id) =>
      id === "g1" ? "customers/vericura" : undefined,
    );
    vi.mocked(inviteOrganizationUser).mockResolvedValue(new Response(null, { status: 204 }));
    vi.mocked(consultUserMgmtGate).mockResolvedValue(undefined);
    vi.mocked(createPendingGroupAssignments).mockResolvedValue(undefined);
    vi.mocked(assertGroupsInScope).mockResolvedValue([] as never);
    vi.mocked(assertGrantScope).mockReturnValue(undefined);
  });

  test("invites one email, records the group assignment and flashes the summary", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue(scopedGroup as never);

    const response = (await inviteUserAction({
      request: formRequest({ emails: ["New@Example.com"], groupIds: ["g1"] }),
      context: runContext(),
      params: {},
    } as never)) as Response;

    expect(inviteOrganizationUser).toHaveBeenCalledWith("org-1", "New@Example.com");
    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      ["New@Example.com"],
      ["customers/vericura"],
      "admin-1",
    );
    expect(sessionSet).toHaveBeenCalledWith("notification", {
      status: "success",
      message: "Invited 1 of 1 user to acme.",
    });
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/users?scope=customers");
    expect(commitSession).toHaveBeenCalledTimes(1);
  });

  test("consults the gate for invite and addToGroup with the email count", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue(scopedGroup as never);

    await inviteUserAction({
      request: formRequest({
        emails: ["a@example.com", "b@example.com"],
        groupIds: ["g1"],
      }),
      context: runContext(),
      params: {},
    } as never);

    const actions = vi
      .mocked(consultUserMgmtGate)
      .mock.calls.map((c) => c[1] as { kind: string; inviteCount?: number; addCount?: number });
    expect(actions).toEqual([
      { kind: "invite", inviteCount: 2 },
      { kind: "addToGroup", groupPath: "customers/vericura", addCount: 2 },
    ]);
    expect(inviteOrganizationUser).toHaveBeenCalledTimes(2);
  });

  test("still records the assignment when the invite 409s", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue(scopedGroup as never);
    vi.mocked(inviteOrganizationUser).mockRejectedValue(conflict());

    await inviteUserAction({
      request: formRequest({ emails: ["u@example.com"], groupIds: ["g1"] }),
      context: runContext(),
      params: {},
    } as never);

    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      ["u@example.com"],
      ["customers/vericura"],
      "admin-1",
    );
    expect(sessionSet).toHaveBeenCalledWith("notification", {
      status: "warning",
      message: "1 already had a pending invitation or was a member.",
    });
  });

  test("invites several emails and records them in one batched assignment", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue(scopedGroup as never);

    await inviteUserAction({
      request: formRequest({
        emails: ["a@example.com", "b@example.com", "c@example.com"],
        groupIds: ["g1"],
      }),
      context: runContext(),
      params: {},
    } as never);

    expect(inviteOrganizationUser).toHaveBeenCalledTimes(3);
    expect(createPendingGroupAssignments).toHaveBeenCalledTimes(1);
    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      ["a@example.com", "b@example.com", "c@example.com"],
      ["customers/vericura"],
      "admin-1",
    );
    expect(sessionSet).toHaveBeenCalledWith("notification", {
      status: "success",
      message: "Invited 3 of 3 users to acme.",
    });
  });

  test("records nothing for an email whose invite failed with a real error", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue(scopedGroup as never);
    vi.mocked(inviteOrganizationUser)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new Error("kc down"))
      .mockRejectedValueOnce(conflict());

    await inviteUserAction({
      request: formRequest({
        emails: ["a@example.com", "b@example.com", "c@example.com"],
        groupIds: ["g1"],
      }),
      context: runContext(),
      params: {},
    } as never);

    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      ["a@example.com", "c@example.com"],
      ["customers/vericura"],
      "admin-1",
    );
    expect(sessionSet).toHaveBeenCalledWith("notification", {
      status: "warning",
      message:
        "Invited 1 of 3 users to acme. 1 already had a pending invitation or was a member. 1 failed.",
    });
  });

  test("reports an error summary when every invite fails", async () => {
    vi.mocked(inviteOrganizationUser).mockRejectedValue(new Error("kc down"));

    const response = (await inviteUserAction({
      request: formRequest({ emails: ["a@example.com", "b@example.com"] }),
      context: runContext(),
      params: {},
    } as never)) as Response;

    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
    expect(sessionSet).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Failed to invite 2 users. Please try again.",
    });
    expect(response.status).toBe(302);
  });

  test("rejects a group id that does not resolve in the scope tree with 403", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue([] as never);

    await expect(
      inviteUserAction({
        request: formRequest({ emails: ["u@example.com"], groupIds: "forged" }),
        context: runContext(),
        params: {},
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(inviteOrganizationUser).not.toHaveBeenCalled();
    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
  });

  test("rejects a group outside the admin scope with 403", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue([
      { id: "g1", name: "vericura", path: "/lab/vericura", subGroups: [] },
    ] as never);
    vi.mocked(assertGrantScope).mockImplementation(() => {
      throw new Response("Not authorized", { status: 403 });
    });

    await expect(
      inviteUserAction({
        request: formRequest({ emails: ["u@example.com"], groupIds: ["g1"] }),
        context: runContext(),
        params: {},
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
  });

  test("rejects an empty email list before any Keycloak call", async () => {
    const response = await inviteUserAction({
      request: formRequest({}),
      context: runContext(),
      params: {},
    } as never);

    expect(response).toEqual({
      errors: { emails: ["Enter at least one email address"] },
    });
    expect(inviteOrganizationUser).not.toHaveBeenCalled();
  });

  test("rejects an invalid email address before any Keycloak call", async () => {
    const response = await inviteUserAction({
      request: formRequest({ emails: ["not-an-email", "b@example.com"] }),
      context: runContext(),
      params: {},
    } as never);

    expect(response).toEqual({ errors: { emails: ["Invalid email"] } });
    expect(inviteOrganizationUser).not.toHaveBeenCalled();
  });

  test("refuses more than 100 emails", async () => {
    const emails = Array.from({ length: 101 }, (_, i) => `user${i}@example.com`);

    const response = await inviteUserAction({
      request: formRequest({ emails }),
      context: runContext(),
      params: {},
    } as never);

    expect(response).toEqual({
      errors: { emails: ["Enter at most 100 email addresses"] },
    });
    expect(inviteOrganizationUser).not.toHaveBeenCalled();
  });

  test("invites without groups when none selected (plain invite)", async () => {
    await inviteUserAction({
      request: formRequest({ emails: ["u@example.com"] }),
      context: runContext(),
      params: {},
    } as never);

    expect(inviteOrganizationUser).toHaveBeenCalledWith("org-1", "u@example.com");
    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
    expect(sessionSet).toHaveBeenCalledWith("notification", {
      status: "success",
      message: "Invited 1 of 1 user to acme.",
    });
  });
});
