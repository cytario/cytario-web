import { describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import {
  applyBucketGrantSet,
  applyGrantsAndRecordStatus,
} from "~/routes/connections/connectionGrant.server";
import { updateAction } from "~/routes/connections/updateConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: { commitSession: vi.fn(async () => "cookie") },
}));
vi.mock("~/.server/providers/providerCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/providerCatalog.server")>(
    "~/.server/providers/providerCatalog.server",
  );
  return { ...actual, getProviderCatalog: vi.fn() };
});
vi.mock("~/routes/connections/connectionGrant.server", async () => {
  const actual = await vi.importActual<
    typeof import("~/routes/connections/connectionGrant.server")
  >("~/routes/connections/connectionGrant.server");
  return {
    ...actual,
    applyGrantsAndRecordStatus: vi.fn(async () => ({ status: "applied", result: {} })),
    applyBucketGrantSet: vi.fn(async () => ({ status: "applied", result: {} })),
  };
});

function buildArgs(user: ReturnType<typeof mock.user>, form: Record<string, string>) {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, { user });
  ctx.set(sessionContext, mock.session({ authTokens: { idToken: "tok" } as never }));
  const request = new Request("http://localhost/connections", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return {
    request,
    params: {},
    context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
  } as unknown as Parameters<typeof updateAction>[0];
}

const catalog = mock.providerCatalog({
  providerConnections: [
    mock.providerConnection({ id: "pc-old" }),
    mock.providerConnection({ id: "pc-new" }),
  ],
  providerRoles: [
    mock.providerRole({ id: "pr-old", providerConnectionId: "pc-old", allowedScopes: ["*"] }),
    mock.providerRole({ id: "pr-new", providerConnectionId: "pc-new", allowedScopes: ["*"] }),
  ],
});

const existing = mock.connectionConfig({
  id: 7,
  name: "conn",
  bucketName: "old-bucket",
  providerConnectionId: "pc-old",
  grants: [mock.connectionGrant({ scope: "org1/lab", providerRoleId: "pr-old" })],
});

const form = {
  _originalName: "conn",
  name: "conn",
  bucketName: "new-bucket",
  prefix: "",
  providerConnectionId: "pc-new",
  "grants[0].scope": "org1/lab",
  "grants[0].providerRoleId": "pr-new",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProviderCatalog).mockResolvedValue(catalog);
  vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(existing);
});

describe("updateAction — old-bucket revoke on move", () => {
  test("re-applies the OLD bucket's grant set (under the pre-move provider refs) when the bucket moves", async () => {
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...existing,
      bucketName: "new-bucket",
      providerConnectionId: "pc-new",
      grants: [mock.connectionGrant({ scope: "org1/lab", providerRoleId: "pr-new" })],
    } as never);

    const user = mock.user({ adminScopes: ["org1/lab"] });
    const result = await updateAction(buildArgs(user, form));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);

    expect(applyGrantsAndRecordStatus).toHaveBeenCalledTimes(1);

    expect(applyBucketGrantSet).toHaveBeenCalledTimes(1);
    const [bucket, applyVia] = vi.mocked(applyBucketGrantSet).mock.calls[0];
    expect(bucket).toEqual({
      organization: "org1",
      providerConnectionId: "pc-old",
      bucketName: "old-bucket",
    });
    expect(applyVia.bucketName).toBe("old-bucket");
    expect(applyVia.providerConnectionId).toBe("pc-old");
  });

  test("does NOT touch another bucket when only a grant changes (not the bucket)", async () => {
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...existing,
      grants: [mock.connectionGrant({ scope: "org1/lab/team-a", providerRoleId: "pr-old" })],
    } as never);

    const user = mock.user({ adminScopes: ["org1/lab"] });
    await updateAction(
      buildArgs(user, {
        ...form,
        bucketName: "old-bucket",
        providerConnectionId: "pc-old",
        "grants[0].scope": "org1/lab/team-a",
        "grants[0].providerRoleId": "pr-old",
      }),
    );

    expect(applyGrantsAndRecordStatus).toHaveBeenCalledTimes(1);
    expect(applyBucketGrantSet).not.toHaveBeenCalled();
  });

  test("warns (does not fail the update) when the old bucket's revoke is refused", async () => {
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...existing,
      bucketName: "new-bucket",
      providerConnectionId: "pc-new",
      grants: [mock.connectionGrant({ scope: "org1/lab", providerRoleId: "pr-new" })],
    } as never);
    vi.mocked(applyBucketGrantSet).mockResolvedValue({
      status: "error",
      warning: "catalog gone",
    });

    const user = mock.user({ adminScopes: ["org1/lab"] });
    const session = mock.session({ authTokens: { idToken: "tok" } as never });
    const ctx = new Map<unknown, unknown>();
    ctx.set(authContext, { user });
    ctx.set(sessionContext, session);
    const request = new Request("http://localhost/connections", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    const result = await updateAction({
      request,
      params: {},
      context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
    } as unknown as Parameters<typeof updateAction>[0]);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect(session.set).toHaveBeenCalledWith(
      "notification",
      expect.objectContaining({
        status: "warning",
        message: expect.stringContaining("could not be revoked"),
      }),
    );
  });
});
