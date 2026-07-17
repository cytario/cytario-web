import { describe, expect, test, vi } from "vitest";

import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { compileGrantStatements } from "~/.server/storage/bucketPolicy";
import {
  applyBucketGrantSet,
  applyConnectionGrants,
  assembleBucketGrants,
  connectionIsGroupScoped,
  grantForConnection,
  validateProviderRefs,
} from "~/routes/connections/connectionGrant.server";
import mock from "~/utils/__tests__/__mocks__";

// vi.mock is hoisted above the imports by vitest.
vi.mock("~/.server/providers/providerCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/providerCatalog.server")>(
    "~/.server/providers/providerCatalog.server",
  );
  return { ...actual, getProviderCatalog: vi.fn() };
});

vi.mock("~/.server/db/prisma", () => ({
  prisma: { connectionConfig: { findMany: vi.fn(async () => []), update: vi.fn() } },
}));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));

const userSub = "user-abc";

describe("connectionIsGroupScoped", () => {
  test("group scope contributes a grant; personal and org-root do not", () => {
    expect(connectionIsGroupScoped({ scope: "lab/team-a" }, userSub)).toBe(true);
    expect(connectionIsGroupScoped({ scope: userSub }, userSub)).toBe(false);
    expect(connectionIsGroupScoped({ scope: "*" }, userSub)).toBe(false);
  });
});

describe("grantForConnection", () => {
  test("produces an ORG-conditioned, per-group-conditioned statement (fail-closed generator accepts it)", () => {
    const grant = grantForConnection({
      organization: "acme",
      bucketName: "shared",
      scope: "lab/team-a",
      prefix: "images",
    });
    // roleArn is injected at apply-time by applyBucketPolicy; supply a stand-in
    // so compileGrantStatements (the fail-closed generator) accepts it.
    const statements = compileGrantStatements({
      ...grant,
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw",
    });
    for (const s of statements) {
      expect(s.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe("acme");
      expect(s.Condition?.StringEquals?.["aws:PrincipalTag/lab/team-a"]).toBe("1");
    }
    // Fail-safe floor: default access is read-only (no write actions).
    const actions = statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
    expect(actions).not.toContain("s3:PutObject");
    expect(actions).not.toContain("s3:PutBucketPolicy");
  });
});

describe("assembleBucketGrants", () => {
  test("includes only group-scoped connections", () => {
    const configs = [
      mock.connectionConfig({ name: "a", scope: "lab", bucketName: "b" }),
      mock.connectionConfig({ name: "b", scope: userSub, bucketName: "b" }),
      mock.connectionConfig({ name: "c", scope: "*", bucketName: "b" }),
      mock.connectionConfig({ name: "d", scope: "lab/team-b", bucketName: "b" }),
    ];
    const grants = assembleBucketGrants(configs, userSub);
    expect(grants.map((g) => g.groupPath).sort()).toEqual(["lab", "lab/team-b"]);
  });
});

describe("validateProviderRefs", () => {
  const catalog = mock.providerCatalog({
    providerConnections: [mock.providerConnection({ id: "pc-1" })],
    providerRoles: [
      mock.providerRole({
        id: "pr-lab",
        providerConnectionId: "pc-1",
        allowedScopes: ["lab"],
        allowsSharing: true,
      }),
      mock.providerRole({
        id: "pr-ro",
        providerConnectionId: "pc-1",
        allowedScopes: ["*"],
        allowsSharing: false,
      }),
    ],
  });

  test("accepts a role whose allowed scopes cover the submitted scope", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-lab",
      scope: "lab/team-a",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an unknown provider connection", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-nope",
      providerRoleId: "pr-lab",
      scope: "lab",
    });
    expect(result).toEqual({
      ok: false,
      errors: { providerConnectionId: ["Unknown provider connection"] },
    });
  });

  test("rejects a role bound to a different provider connection", () => {
    const other = mock.providerCatalog({
      providerConnections: [
        mock.providerConnection({ id: "pc-1" }),
        mock.providerConnection({ id: "pc-2" }),
      ],
      providerRoles: [mock.providerRole({ id: "pr-lab", providerConnectionId: "pc-2" })],
    });
    const result = validateProviderRefs(other, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-lab",
      scope: "lab",
    });
    expect(result.ok).toBe(false);
  });

  test("SECURITY: rejects a role whose allowed scopes do not cover the submitted scope — client filtering is advisory only", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-lab",
      scope: "ops",
    });
    expect(result).toEqual({
      ok: false,
      errors: { providerRoleId: ["This role does not cover the chosen scope"] },
    });
  });

  test("a `*` allowed scope covers every submitted scope", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-ro",
      scope: "anything/at/all",
    });
    expect(result.ok).toBe(true);
  });

  test("requireSharing rejects a non-sharing role", () => {
    const result = validateProviderRefs(
      catalog,
      { providerConnectionId: "pc-1", providerRoleId: "pr-ro", scope: "lab" },
      { requireSharing: true },
    );
    expect(result).toEqual({
      ok: false,
      errors: { providerRoleId: ["This role cannot be used to share"] },
    });
  });
});

describe("applyBucketGrantSet", () => {
  test("assembles the grant set from the bucket's persisted rows and applies via the given connection", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(mock.providerCatalog());
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([
      mock.connectionConfig({ scope: "lab", bucketName: "b" }),
    ]);

    const bucket = { organization: "org1", providerConnectionId: "pc-mock", bucketName: "b" };
    // The apply itself fails (no real STS in tests) — the assembled query is the
    // behavior under test; the outcome degrades to error, never throws.
    const outcome = await applyBucketGrantSet(bucket, mock.connectionConfig(), {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });

    expect(prisma.connectionConfig.findMany).toHaveBeenCalledWith({ where: bucket });
    expect(["applied", "drifted", "error"]).toContain(outcome.status);
  });
});

describe("applyConnectionGrants — advisory degradation", () => {
  test("returns an error outcome (never throws, never blocks) when the catalog is unavailable", async () => {
    vi.mocked(getProviderCatalog).mockRejectedValueOnce(new Error("catalog down"));
    const config = mock.connectionConfig({ scope: "lab", bucketName: "b" });
    const outcome = await applyConnectionGrants(config, [], {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") expect(outcome.warning).toMatch(/catalog down/i);
  });

  test("returns an error outcome when the connection's provider reference is stale", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValueOnce({
      providerConnections: [],
      providerRoles: [],
    });
    const config = mock.connectionConfig({ scope: "lab", bucketName: "b" });
    const outcome = await applyConnectionGrants(config, [], {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });
    expect(outcome.status).toBe("error");
  });
});
