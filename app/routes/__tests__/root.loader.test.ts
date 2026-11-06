import { describe, expect, test, vi } from "vitest";

import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { loader, type RootLoaderResponse } from "~/root";

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: { commitSession: vi.fn(async () => "cookie") },
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { portal: "https://portal.example.com", docsUrl: "https://docs.example.com" },
    auth: { baseUrl: "https://auth.example.com", clientId: "web" },
  },
}));

/** A stored session user: memberships only, no entitlement fields. */
const sessionUser = {
  sub: "user-1",
  email: "u@example.com",
  email_verified: true,
  name: "U",
  preferred_username: "u",
  given_name: "U",
  family_name: "Ser",
  policy: [],
  organizations: {
    alpha: {
      groups: ["alpha/lab", "alpha/lab/admins"],
      attributes: { subscription_tier: ["pro"] },
    },
    beta: { groups: ["beta/research", "beta/research/admins"], attributes: {} },
  },
} as never;

function loaderArgs(pathname: string) {
  const session = {
    get: (key: string) => (key === "user" ? sessionUser : undefined),
    unset: vi.fn(),
  };
  const context = new Map();
  context.set(sessionContext, session);
  return {
    request: new Request(`http://localhost${pathname}`),
    context: { get: (k: unknown) => context.get(k), set: vi.fn() },
  } as unknown as Parameters<typeof loader>[0];
}

describe("root loader client payload", () => {
  test("the request org's group paths reach the client map; other memberships stay alias-only", async () => {
    const result = (await loader(loaderArgs("/alpha/abc"))) as RootLoaderResponse;

    // The org this document acts in keeps its raw group paths so client-side
    // entitlement derivation (canModify) resolves real admin scopes.
    expect(result.user?.organizations.alpha.groups).toEqual(["alpha/lab", "alpha/lab/admins"]);
    // The other membership's group paths stay host-side (PII).
    expect(result.user?.organizations.beta.groups).toEqual([]);
    // The top-level derived fields name the request org's entitlements.
    expect(result.user?.adminScopes).toEqual(["alpha/lab"]);
    expect(result.user?.groups).toEqual(["alpha/lab"]);
    expect(result.user?.organizationAttributes).toEqual({ subscription_tier: ["pro"] });
  });

  test("an org-less URL ships empty entitlements and every alias-only membership", async () => {
    const result = (await loader(loaderArgs("/login-adjacent"))) as RootLoaderResponse;

    expect(result.user?.adminScopes).toEqual([]);
    expect(result.user?.organizations.alpha.groups).toEqual([]);
    expect(result.user?.organizations.beta.groups).toEqual([]);
  });
});
