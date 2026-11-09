import { describe, expect, test, vi, beforeEach } from "vitest";

import { createGroupAction } from "../createGroup.action";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { profileFromTokenClaims } from "~/.server/auth/getUserInfo";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";

vi.mock("~/.server/auth/keycloakAdmin", () => ({
  createGroup: vi.fn(),
  addUserToOrganizationGroup: vi.fn(),
}));

vi.mock("~/.server/auth/getUserInfo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/getUserInfo")>();
  return { ...actual, profileFromTokenClaims: vi.fn() };
});

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn().mockResolvedValue("mock-cookie"),
  },
}));

const { createGroup, addUserToOrganizationGroup } = await import("~/.server/auth/keycloakAdmin");
const { getSession } = await import("~/.server/auth/getSession");

let mockSession: { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

function makeRequest(name: string, scope = "cytario/lab") {
  const form = new FormData();
  form.append("name", name);
  return new Request(
    `http://localhost/cytario/admin/users/create-group?scope=${encodeURIComponent(scope)}`,
    { method: "POST", body: form },
  );
}

function makeContext(
  adminScopes: string[] = ["cytario"],
  organization = "cytario",
  scope = "cytario/lab",
) {
  const ctx = new Map();
  ctx.set(authContext, {
    user: { sub: "user-123", adminScopes },
    requestOrganization: organization,
    authTokens: { accessToken: "access-token", idToken: "id-token", refreshToken: "refresh-token" },
  });
  ctx.set(adminContext, {
    org: { alias: organization },
    scope,
    adminUrl: "https://admin.cytario.test",
  });
  return ctx;
}

function callAction(request: Request, context: Map<unknown, unknown>) {
  return createGroupAction({
    request,
    context,
    params: {},
  } as unknown as Parameters<typeof createGroupAction>[0]);
}

describe("createGroupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { set: vi.fn(), get: vi.fn() };
    vi.mocked(getSession).mockResolvedValue(mockSession as never);
    vi.mocked(profileFromTokenClaims).mockReturnValue({
      sub: "user-123",
      organizations: { cytario: { groups: [], attributes: {} } },
      adminScopes: [],
      groups: [],
    } as never);
  });

  test("redirects with success notification on valid input", async () => {
    vi.mocked(createGroup).mockResolvedValue({
      id: "new-id",
      path: "cytario/lab/Vericura",
      adminsGroupId: "admins-id",
      orgId: "org-uuid",
    });

    const response = await callAction(makeRequest("Vericura"), makeContext());

    expect(createGroup).toHaveBeenCalledWith("cytario/lab", "Vericura", "cytario");
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("org-uuid", "admins-id", "user-123");
    expect(profileFromTokenClaims).toHaveBeenCalled();
    expect(mockSession.set).toHaveBeenCalledWith(
      "user",
      expect.objectContaining({ sub: "user-123", groups: [], adminScopes: [] }),
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("location")).toBe(
      "/cytario/admin/users?scope=cytario%2Flab%2FVericura",
    );

    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "success",
      message: 'Created group "Vericura".',
    });
  });

  test("persists the ORG-NEUTRAL profile even when the token carries a group", async () => {
    // The stored session user must never carry one org's projection: the
    // request-org groups are applied per request by authMiddleware. A
    // pre-fix version of this action persisted the projected profile here.
    vi.mocked(createGroup).mockResolvedValue({
      id: "new-id",
      path: "cytario/lab/Vericura",
      adminsGroupId: "admins-id",
      orgId: "org-uuid",
    });
    vi.mocked(profileFromTokenClaims).mockReturnValue({
      sub: "user-123",
      organizations: { cytario: { groups: ["cytario/lab"], attributes: {} } },
      adminScopes: [],
      groups: [],
    } as never);

    await callAction(makeRequest("Vericura"), makeContext());

    const stored = vi
      .mocked(mockSession.set)
      .mock.calls.find((call) => call[0] === "user")?.[1] as {
      groups: string[];
      adminScopes: string[];
    };
    expect(stored).toBeDefined();
    expect(stored.groups).toEqual([]);
    expect(stored.adminScopes).toEqual([]);
  });

  test("returns field errors for invalid name", async () => {
    const result = await callAction(makeRequest(""), makeContext());

    expect(createGroup).not.toHaveBeenCalled();
    expect(result).toEqual({
      errors: { name: expect.arrayContaining([expect.any(String)]) },
    });
  });

  test("creates a group whose name contains an underscore", async () => {
    await callAction(makeRequest("team_alpha"), makeContext());

    expect(createGroup).toHaveBeenCalledWith("cytario/lab", "team_alpha", "cytario");
  });

  test("returns 409 duplicate-name error message", async () => {
    vi.mocked(createGroup).mockRejectedValue(new KeycloakAdminError(409, "409 Conflict"));

    const response = await callAction(makeRequest("existing"), makeContext());

    expect(response).toBeInstanceOf(Response);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: 'A group named "existing" already exists in this group.',
    });
  });

  test("returns generic error for non-409 failures", async () => {
    vi.mocked(createGroup).mockRejectedValue(
      new KeycloakAdminError(500, "500 Internal Server Error"),
    );

    const response = await callAction(makeRequest("broken"), makeContext());

    expect(response).toBeInstanceOf(Response);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Failed to create group. Please try again.",
    });
  });

  test("forwards organization to createGroup when parent is the `*` sentinel", async () => {
    vi.mocked(createGroup).mockResolvedValue({
      id: "top-id",
      path: "Lab",
      adminsGroupId: "admins-id",
      orgId: "org-uuid",
    });

    const response = await callAction(makeRequest("Lab", "*"), makeContext(["*"], "cytario", "*"));

    expect(createGroup).toHaveBeenCalledWith("*", "Lab", "cytario");
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("org-uuid", "admins-id", "user-123");
    expect((response as Response).headers.get("location")).toBe("/cytario/admin/users?scope=Lab");
  });
});
