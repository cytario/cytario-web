import { beforeEach, describe, expect, test, vi } from "vitest";

import { bulkInviteAction } from "../bulkInvite.action";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: { commitSession: vi.fn().mockResolvedValue("session-cookie") },
}));

vi.mock("~/.server/auth/getUserInfo", () => ({
  toIdentity: vi.fn((u: unknown) => u),
}));

vi.mock("~/.server/auth/keycloakAdmin", () => ({
  inviteOrganizationUser: vi.fn(),
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
const { KeycloakAdminError } = await import("~/.server/auth/keycloakAdmin/client");

const adminUser = {
  sub: "admin-1",
  email: "admin@example.com",
  organizations: { acme: { groups: ["customers/admins"], attributes: {} } },
};

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

function jsonRequest(rows: { email: string }[], groupIds: string[]): Request {
  return new Request("http://localhost/admin/users/bulk-invite?scope=customers", {
    method: "POST",
    body: JSON.stringify({ rows, groupIds }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("bulkInviteAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSession).mockResolvedValue({ set: vi.fn(), get: vi.fn() } as never);
    vi.mocked(findGroupPathInTree).mockImplementation((_tree, id) =>
      id === "g1" ? "customers/vericura" : undefined,
    );
    vi.mocked(consultUserMgmtGate).mockResolvedValue(undefined);
    vi.mocked(createPendingGroupAssignments).mockResolvedValue(undefined);
    vi.mocked(assertGroupsInScope).mockResolvedValue([] as never);
    vi.mocked(assertGrantScope).mockReturnValue(undefined);
  });

  test("records one pending assignment per email × group for succeeded rows", async () => {
    vi.mocked(inviteOrganizationUser).mockResolvedValue(new Response(null, { status: 204 }));

    const response = await bulkInviteAction({
      request: jsonRequest([{ email: "a@example.com" }, { email: "b@example.com" }], ["g1"]),
      context: runContext(),
      params: {},
    } as never);

    expect(inviteOrganizationUser).toHaveBeenCalledTimes(2);
    expect(createPendingGroupAssignments).toHaveBeenCalledTimes(2);
    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      "a@example.com",
      ["customers/vericura"],
      "admin-1",
    );
    expect(response).toBeInstanceOf(Response);
  });

  test("skips the assignment for rows whose invite failed with a real error", async () => {
    vi.mocked(inviteOrganizationUser)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new Error("kc down"));

    await bulkInviteAction({
      request: jsonRequest([{ email: "a@example.com" }, { email: "b@example.com" }], ["g1"]),
      context: runContext(),
      params: {},
    } as never);

    expect(createPendingGroupAssignments).toHaveBeenCalledTimes(1);
    expect(createPendingGroupAssignments).toHaveBeenCalledWith(
      "acme",
      "a@example.com",
      ["customers/vericura"],
      "admin-1",
    );
  });

  test("records the assignment for 409 rows (already member / pending)", async () => {
    vi.mocked(inviteOrganizationUser)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(
        new (KeycloakAdminError as new (status: number, message: string) => Error)(409, "conflict"),
      );

    await bulkInviteAction({
      request: jsonRequest([{ email: "a@example.com" }, { email: "b@example.com" }], ["g1"]),
      context: runContext(),
      params: {},
    } as never);

    expect(createPendingGroupAssignments).toHaveBeenCalledTimes(2);
  });

  test("writes no assignments when no groups selected", async () => {
    vi.mocked(inviteOrganizationUser).mockResolvedValue(new Response(null, { status: 204 }));

    await bulkInviteAction({
      request: jsonRequest([{ email: "a@example.com" }], []),
      context: runContext(),
      params: {},
    } as never);

    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
  });

  test("consults the gate with invite (row count) and addToGroup (row count)", async () => {
    vi.mocked(inviteOrganizationUser).mockResolvedValue(new Response(null, { status: 204 }));

    await bulkInviteAction({
      request: jsonRequest([{ email: "a@example.com" }, { email: "b@example.com" }], ["g1"]),
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
  });

  test("rejects a group outside the admin scope with 403", async () => {
    vi.mocked(assertGroupsInScope).mockResolvedValue([
      { id: "g1", name: "vericura", path: "/lab/vericura", subGroups: [] },
    ] as never);
    vi.mocked(assertGrantScope).mockImplementation(() => {
      throw new Response("Not authorized", { status: 403 });
    });

    await expect(
      bulkInviteAction({
        request: jsonRequest([{ email: "a@example.com" }], ["g1"]),
        context: runContext(),
        params: {},
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(createPendingGroupAssignments).not.toHaveBeenCalled();
  });
});
