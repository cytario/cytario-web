import { describe, expect, test, vi, beforeEach } from "vitest";

import { createGroupAction } from "../createGroup.action";
import { authContext } from "~/.server/auth/authMiddleware";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";

vi.mock("~/.server/auth/keycloakAdmin", () => ({
  createGroup: vi.fn(),
  addUserToGroup: vi.fn(),
}));

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn().mockResolvedValue("mock-cookie"),
  },
}));

const { createGroup, addUserToGroup } = await import(
  "~/.server/auth/keycloakAdmin"
);
const { getSession } = await import("~/.server/auth/getSession");

let mockSession: { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

function makeRequest(name: string, scope = "cytario/lab") {
  const form = new FormData();
  form.append("name", name);
  return new Request(
    `http://localhost/admin/users/create-group?scope=${encodeURIComponent(scope)}`,
    { method: "POST", body: form },
  );
}

function makeContext(adminScopes: string[] = ["cytario"]) {
  const ctx = new Map();
  ctx.set(authContext, {
    user: { sub: "user-123", adminScopes },
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
  });

  test("redirects with success notification on valid input", async () => {
    vi.mocked(createGroup).mockResolvedValue({
      id: "new-id",
      path: "cytario/lab/Ultivue",
      adminsGroupId: "admins-id",
    });

    const response = await callAction(
      makeRequest("Ultivue"),
      makeContext(),
    );

    expect(createGroup).toHaveBeenCalledWith("cytario/lab", "Ultivue");
    expect(addUserToGroup).toHaveBeenCalledWith("user-123", "admins-id");
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("location")).toBe(
      "/admin/users?scope=cytario%2Flab%2FUltivue",
    );

    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "success",
      message: 'Created group "Ultivue".',
    });
  });

  test("returns field errors for invalid name", async () => {
    const result = await callAction(makeRequest(""), makeContext());

    expect(createGroup).not.toHaveBeenCalled();
    expect(result).toEqual({
      errors: { name: expect.arrayContaining([expect.any(String)]) },
    });
  });

  test("returns 409 duplicate-name error message", async () => {
    vi.mocked(createGroup).mockRejectedValue(
      new KeycloakAdminError(409, "409 Conflict"),
    );

    const response = await callAction(
      makeRequest("existing"),
      makeContext(),
    );

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

    const response = await callAction(
      makeRequest("broken"),
      makeContext(),
    );

    expect(response).toBeInstanceOf(Response);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Failed to create group. Please try again.",
    });
  });

  test("throws 403 when user lacks admin scope", async () => {
    await expect(
      callAction(makeRequest("foo"), makeContext(["other/scope"])),
    ).rejects.toThrow(Response);
  });

  test("throws 400 when scope query param is missing", async () => {
    const request = new Request(
      "http://localhost/admin/users/create-group",
      {
        method: "POST",
        body: (() => {
          const f = new FormData();
          f.append("name", "foo");
          return f;
        })(),
      },
    );

    await expect(
      callAction(request, makeContext()),
    ).rejects.toThrow(Response);
  });
});
