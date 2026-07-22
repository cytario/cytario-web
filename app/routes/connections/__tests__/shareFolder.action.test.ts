import { describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { applyGrantsAndRecordStatus } from "~/routes/connections/connectionGrant.server";
import { shareAction } from "~/routes/connections/shareFolder.action";
import mock from "~/utils/__tests__/__mocks__";

// All vi.mock calls are hoisted above the imports by vitest.
vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      create: vi.fn(),
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
  } as unknown as Parameters<typeof shareAction>[0];
}

const sharerRole = mock.providerRole({
  id: "pr-share",
  providerConnectionId: "pc-1",
  allowedScopes: ["lab"],
  allowsSharing: true,
});
const catalog = mock.providerCatalog({
  providerConnections: [mock.providerConnection({ id: "pc-1" })],
  providerRoles: [sharerRole],
});

const validForm = {
  _intent: "share",
  name: "team-a-share",
  bucketName: "shared-bucket",
  providerConnectionId: "pc-1",
  prefix: "images",
  "grants[0].scope": "lab",
  "grants[0].providerRoleId": "pr-share",
};

describe("shareAction — server-side grant authorization (SRS-CY-32607 / 413109)", () => {
  test("rejects an unauthorized target scope with HTTP 403 before any mint or write", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(catalog);
    const user = mock.user({ adminScopes: ["lab"], organization: "org1" });
    const args = buildArgs(user, { ...validForm, "grants[0].scope": "ops" });

    const response = await shareAction(args).catch((e: unknown) => e);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);

    expect(applyGrantsAndRecordStatus).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("accepts a read-only (non-sharing) grant role — the bucket-policy write picks a sharing-capable grant's role via resolveApplyTarget", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-1" })],
        providerRoles: [
          mock.providerRole({ id: "pr-ro", providerConnectionId: "pc-1", allowsSharing: false }),
        ],
      }),
    );
    const created = mock.connectionConfig({
      id: 5,
      name: "team-a-share",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-ro" })],
    });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);
    vi.mocked(applyGrantsAndRecordStatus).mockResolvedValue({
      status: "applied",
      result: { status: "applied" },
    });

    const user = mock.user({ adminScopes: ["lab"], organization: "org1" });
    const args = buildArgs(user, { ...validForm, "grants[0].providerRoleId": "pr-ro" });

    await shareAction(args);

    expect(prisma.connectionConfig.create).toHaveBeenCalled();
    expect(applyGrantsAndRecordStatus).toHaveBeenCalled();
  });

  test("creates the share and applies when authorized", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(catalog);
    const created = mock.connectionConfig({
      id: 5,
      name: "team-a-share",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-share" })],
    });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);

    const user = mock.user({ adminScopes: ["lab"], organization: "org1" });
    const args = buildArgs(user, validForm);

    const result = await shareAction(args);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect(prisma.connectionConfig.create).toHaveBeenCalled();
    expect(applyGrantsAndRecordStatus).toHaveBeenCalled();
  });
});
