import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/.server/auth/authMiddleware", async () => {
  const { createContext } = await import("react-router");
  return { authContext: createContext() };
});

vi.mock("~/.server/auth/keycloakAdmin", () => ({
  findOrganizationByAlias: vi.fn(),
}));

const { adminContext, adminMiddleware } = await import("../adminMiddleware");
const { authContext } = await import("~/.server/auth/authMiddleware");
const { findOrganizationByAlias } = await import("~/.server/auth/keycloakAdmin");

const mockOrg = { id: "org-uuid", name: "Cytario", alias: "cytario" };

function makeContext(user: Record<string, unknown> | undefined) {
  const store = new Map<unknown, unknown>();
  if (user) store.set(authContext, { user });
  const context = {
    get: (ctx: unknown) => store.get(ctx),
    set: (ctx: unknown, value: unknown) => {
      store.set(ctx, value);
    },
  } as unknown as Parameters<typeof adminMiddleware>[0]["context"];
  return { context, store };
}

function callMiddleware(url: string, user: Record<string, unknown> | undefined) {
  const next = vi.fn().mockResolvedValue(undefined);
  const { context, store } = makeContext(user);
  const result = adminMiddleware(
    {
      request: new Request(url),
      context,
      params: {},
    } as unknown as Parameters<typeof adminMiddleware>[0],
    next,
  ) as Promise<unknown>;
  return { next, result, store };
}

const BASE_USER = { sub: "user-123", organization: "cytario", adminScopes: ["cytario"] };

describe("adminMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findOrganizationByAlias).mockResolvedValue(mockOrg);
  });

  test("resolves org and scope, stashes them in context, and calls next", async () => {
    const { next, result, store } = callMiddleware(
      "http://localhost/admin/users?scope=cytario%2Flab",
      BASE_USER,
    );

    await result;

    expect(next).toHaveBeenCalledTimes(1);
    expect(findOrganizationByAlias).toHaveBeenCalledWith("cytario");
    expect(store.get(adminContext)).toEqual({
      org: mockOrg,
      scope: "cytario/lab",
      adminUrl: "/admin/users?scope=cytario%2Flab",
    });
  });

  test("throws 400 when the session has no active organization", async () => {
    const { next, result } = callMiddleware("http://localhost/admin/users?scope=cytario", {
      ...BASE_USER,
      organization: undefined,
    });

    const error = (await result.catch((e: unknown) => e)) as Response;
    expect(error).toBeInstanceOf(Response);
    expect(error.status).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("throws 400 when the scope query param is missing", async () => {
    const { next, result } = callMiddleware("http://localhost/admin/users", BASE_USER);

    const error = (await result.catch((e: unknown) => e)) as Response;
    expect(error).toBeInstanceOf(Response);
    expect(error.status).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("throws 403 when the user does not administer the scope", async () => {
    const { next, result } = callMiddleware("http://localhost/admin/users?scope=other-org", {
      ...BASE_USER,
      adminScopes: ["cytario"],
    });

    const error = (await result.catch((e: unknown) => e)) as Response;
    expect(error).toBeInstanceOf(Response);
    expect(error.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("throws 404 when the organization is not found in Keycloak", async () => {
    vi.mocked(findOrganizationByAlias).mockResolvedValue(undefined);

    const { next, result } = callMiddleware(
      "http://localhost/admin/users?scope=cytario",
      BASE_USER,
    );

    const error = (await result.catch((e: unknown) => e)) as Response;
    expect(error).toBeInstanceOf(Response);
    expect(error.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  test("an org-root admin (*) can target a child scope", async () => {
    const { result, store } = callMiddleware("http://localhost/admin/users?scope=cytario%2Flab", {
      ...BASE_USER,
      adminScopes: ["*"],
    });

    await result;

    expect(store.get(adminContext)).toMatchObject({ scope: "cytario/lab" });
  });
});
