import { beforeEach, describe, expect, test, vi } from "vitest";

import { inviteUserAction } from "../inviteUser.action";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";

const commitSession = vi.fn().mockResolvedValue("session-cookie");

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn().mockResolvedValue({
    set: vi.fn(),
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

const { inviteOrganizationUser, findGroupPathInTree } =
  await import("~/.server/auth/keycloakAdmin");
const { createPendingGroupAssignments } = await import("~/.server/auth/pendingGroupAssignments");
const { consultUserMgmtGate } = await import("~/.server/userManagementGate");
const { assertGroupsInScope } = await import("../../assertGroupsInScope");
const { assertGrantScope } = await import("../../assertAdminScope");

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

describe("inviteUserAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(findGroupPathInTree).mockImplementation((_tree, id) =>
      id === "g1" ? "customers/vericura" : undefined,
    );
    vi.mocked(inviteOrganizationUser).mockResolvedValue(new Response(null, { status: 204 }));
    vi.mocked(consultUserMgmtGate).mockResolvedValue(undefined);
    vi.mocked(createPendingGroupAssignments).mockResolvedValue(undefined);
    vi.mocked(assertGroupsInScope).mockResolvedValue([] as never);
    vi.mocked(assertGrantScope).mockReturnValue(undefined);
  });

  test("invites and records the pending group assignment with normalized email", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue([
      { id: "g1", name: "vericura", path: "/customers/vericura", subGroups: [] },
    ] as never);

    const response = await inviteUserAction({
      request: formRequest({ email: "New@Example.com", groupIds: ["g1"], inviteAnother: "true" }),
      context: runContext(),
      params: {},
    } as never);

    expect(inviteOrganizationUser).toHaveBeenCalledWith("org-1", "New@Example.com");
    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      "New@Example.com",
      ["customers/vericura"],
      "admin-1",
    );
    expect(response).toEqual({
      success: true,
      message: expect.stringContaining("New@Example.com"),
    });
  });

  test("consults the gate for invite and addToGroup before the KC call", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue([
      { id: "g1", name: "vericura", path: "/customers/vericura", subGroups: [] },
    ] as never);

    await inviteUserAction({
      request: formRequest({ email: "u@example.com", groupIds: ["g1"], inviteAnother: "true" }),
      context: runContext(),
      params: {},
    } as never);

    const kinds = vi
      .mocked(consultUserMgmtGate)
      .mock.calls.map((c) => (c[1] as { kind: string }).kind);
    expect(kinds).toEqual(["invite", "addToGroup"]);
    expect(inviteOrganizationUser).toHaveBeenCalled();
  });

  test("still records the assignment when the invite 409s", async () => {
    const { KeycloakAdminError } = await import("~/.server/auth/keycloakAdmin/client");
    vi.mocked(inviteOrganizationUser).mockRejectedValue(
      new (KeycloakAdminError as new (status: number, message: string) => Error)(409, "conflict"),
    );

    const response = await inviteUserAction({
      request: formRequest({ email: "u@example.com", groupIds: ["g1"], inviteAnother: "true" }),
      context: runContext(),
      params: {},
    } as never);

    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      "u@example.com",
      ["customers/vericura"],
      "admin-1",
    );
    expect(response).toEqual({
      success: true,
      message: expect.stringContaining("Invited"),
    });
  });

  test("rejects a group id that does not resolve in the scope tree with 403", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue([] as never);

    await expect(
      inviteUserAction({
        request: formRequest({ email: "u@example.com", groupIds: "forged", inviteAnother: "true" }),
        context: runContext(),
        params: {},
      } as never),
    ).rejects.toMatchObject({ status: 403 });
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
        request: formRequest({ email: "u@example.com", groupIds: ["g1"], inviteAnother: "true" }),
        context: runContext(),
        params: {},
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
  });

  test("invites without groups when none selected (plain invite)", async () => {
    const response = await inviteUserAction({
      request: formRequest({ email: "u@example.com", inviteAnother: "true" }),
      context: runContext(),
      params: {},
    } as never);

    expect(inviteOrganizationUser).toHaveBeenCalledWith("org-1", "u@example.com");
    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
    expect(response).toEqual({ success: true, message: expect.any(String) });
  });
});
