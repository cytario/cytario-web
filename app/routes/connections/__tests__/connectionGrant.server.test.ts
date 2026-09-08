import { describe, expect, test, vi } from "vitest";

import { prisma } from "~/.server/db/prisma";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { compileGrantStatements } from "~/.server/storage/bucketPolicy";
import { applyBucketPolicy } from "~/.server/storage/bucketPolicyApply.server";
import {
  applyBucketGrantSet,
  assembleBucketGrants,
  grantForConnection,
  resolveApplyTarget,
  validateBucketRef,
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

vi.mock("~/.server/providers/bucketCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/bucketCatalog.server")>(
    "~/.server/providers/bucketCatalog.server",
  );
  return { ...actual, getBucketCatalog: vi.fn() };
});

vi.mock("~/config", () => ({
  cytarioConfig: { providers: { source: "portal" } },
}));

vi.mock("~/.server/db/prisma", () => ({
  prisma: { connectionConfig: { findMany: vi.fn(async () => []), update: vi.fn() } },
}));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
vi.mock("~/.server/storage/bucketPolicyApply.server", () => ({
  applyBucketPolicy: vi.fn(async () => ({ status: "applied" })),
}));

const roleArn = "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw";

const catalog = mock.providerCatalog({
  providerConnections: [mock.providerConnection({ id: "pc-mock" })],
  providerRoles: [
    mock.providerRole({
      providerConnectionId: "pc-mock",
      roleArn,
      accessLevel: "read-write",
    }),
    mock.providerRole({
      providerConnectionId: "pc-mock",
      roleArn: "arn:aws:iam::123456789012:role/read-only",
      accessLevel: "read-only",
    }),
  ],
});

const shareableCatalog = mock.providerCatalog({
  providerConnections: [mock.providerConnection({ id: "pc-mock" })],
  providerRoles: [
    mock.providerRole({
      id: "pr-ro",
      providerConnectionId: "pc-mock",
      roleArn: "arn:aws:iam::123456789012:role/read-only",
      accessLevel: "read-only",
    }),
    mock.providerRole({
      id: "pr-rw",
      providerConnectionId: "pc-mock",
      roleArn: "arn:aws:iam::123456789012:role/admin",
      accessLevel: "admin",
    }),
  ],
});

describe("grantForConnection", () => {
  test("produces an ORG-conditioned, per-group-conditioned statement (fail-closed generator accepts it)", () => {
    const grant = grantForConnection(
      { organization: "acme", bucketName: "shared", prefix: "images" },
      { scope: "lab/team-a" },
      roleArn,
      "read-only",
    );
    const statements = compileGrantStatements(grant);
    for (const s of statements) {
      expect(s.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe("acme");
      expect(s.Condition?.StringEquals?.["aws:PrincipalTag/lab/team-a"]).toBe("1");
    }
    const actions = statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
    expect(actions).not.toContain("s3:PutObject");
    expect(actions).not.toContain("s3:PutBucketPolicy");
  });

  test("C-378: threads the resolved role's accessLevel into the grant (read-write emits write actions)", () => {
    const grant = grantForConnection(
      { organization: "acme", bucketName: "shared", prefix: "images" },
      { scope: "lab/team-a" },
      roleArn,
      "read-write",
    );
    expect(grant.accessLevel).toBe("read-write");
    const statements = compileGrantStatements(grant);
    const objectStmt = statements.find((s) => s.Resource === "arn:aws:s3:::shared/images/*")!;
    const actions = Array.isArray(objectStmt.Action) ? objectStmt.Action : [objectStmt.Action];
    expect(actions).toContain("s3:PutObject");
    expect(actions).toContain("s3:AbortMultipartUpload");
  });

  test("C-420: org-root scope (*) emits ONLY the ORG condition (no aws:PrincipalTag/* tag)", () => {
    const grant = grantForConnection(
      { organization: "acme", bucketName: "shared", prefix: "images" },
      { scope: "*" },
      roleArn,
      "read-only",
    );
    expect(grant.groupPath).toBe("*");
    const statements = compileGrantStatements(grant);
    for (const s of statements) {
      expect(s.Condition?.StringEquals?.["aws:PrincipalTag/ORG"]).toBe("acme");
      expect(s.Condition?.StringEquals).not.toHaveProperty("aws:PrincipalTag/*");
    }
  });
});

describe("assembleBucketGrants", () => {
  test("flattens grants from all connections and resolves role ARNs from the catalog", () => {
    const configs = [
      mock.connectionConfig({
        name: "a",
        bucketName: "b",
        grants: [mock.connectionGrant({ scope: "lab", accessLevel: "read-write" })],
      }),
      mock.connectionConfig({
        name: "d",
        bucketName: "b",
        grants: [
          mock.connectionGrant({ scope: "lab/team-b", accessLevel: "read-write" }),
          mock.connectionGrant({ scope: "lab/team-c", accessLevel: "read-write" }),
        ],
      }),
    ];
    const grants = assembleBucketGrants(configs, catalog);
    expect(grants.map((g) => g.groupPath).sort()).toEqual(["lab", "lab/team-b", "lab/team-c"]);
    for (const g of grants) {
      expect(g.roleArn).toBe(roleArn);
      expect(g.accessLevel).toBe("read-write");
    }
  });

  test("skips grants whose level has no role in the catalog", () => {
    const configs = [
      mock.connectionConfig({
        name: "a",
        bucketName: "b",
        grants: [
          mock.connectionGrant({ scope: "lab", accessLevel: "read-write" }),
          mock.connectionGrant({ scope: "ops", accessLevel: "admin" }),
        ],
      }),
    ];
    const grants = assembleBucketGrants(configs, catalog);
    expect(grants.map((g) => g.groupPath)).toEqual(["lab"]);
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
        accessLevel: "admin",
      }),
      mock.providerRole({
        id: "pr-ro",
        providerConnectionId: "pc-1",
        allowedScopes: ["*"],
        accessLevel: "read-only",
      }),
    ],
  });

  test("accepts a grant whose level's role covers the submitted scope", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "admin", scope: "lab/team-a" }],
    });
    expect(result.ok).toBe(true);
  });

  test("accepts multiple grants with different levels", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [
        { accessLevel: "admin", scope: "lab/team-a" },
        { accessLevel: "read-only", scope: "ops" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an unknown provider connection", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-nope",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "read-only", scope: "lab" }],
    });
    expect(result).toEqual({
      ok: false,
      errors: { providerConnectionId: ["Unknown provider connection"] },
    });
  });

  test("rejects a level whose roles all live under a different provider connection", () => {
    const other = mock.providerCatalog({
      providerConnections: [
        mock.providerConnection({ id: "pc-1" }),
        mock.providerConnection({ id: "pc-2" }),
      ],
      providerRoles: [mock.providerRole({ providerConnectionId: "pc-2", accessLevel: "admin" })],
    });
    const result = validateProviderRefs(other, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "admin", scope: "lab" }],
    });
    expect(result.ok).toBe(false);
  });

  test("SECURITY: rejects a level whose role's allowed scopes do not cover the submitted scope — client filtering is advisory only", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "admin", scope: "ops" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["grants.0.accessLevel"]).toBeDefined();
    }
  });

  test("a `*` allowed scope covers every submitted scope", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "read-only", scope: "anything/at/all" }],
    });
    expect(result.ok).toBe(true);
  });

  test("C-343: an org-wide role (empty allowedScopes) covers any submitted scope", () => {
    const orgWideCatalog = mock.providerCatalog({
      providerConnections: [mock.providerConnection({ id: "pc-1" })],
      providerRoles: [
        mock.providerRole({
          id: "pr-org-wide",
          providerConnectionId: "pc-1",
          allowedScopes: [],
        }),
      ],
    });
    const result = validateProviderRefs(orgWideCatalog, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "read-only", scope: "any/group/scope" }],
    });
    expect(result.ok).toBe(true);
  });

  test("C-347: returns per-grant errors keyed by grants.<index>.accessLevel", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [
        { accessLevel: "admin", scope: "lab" },
        { accessLevel: "admin", scope: "ops" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["grants.1.accessLevel"]).toBeDefined();
      expect(result.errors["grants.0.accessLevel"]).toBeUndefined();
    }
  });

  test("rejects a level with no storage role on the connection", () => {
    const noRoleForLevel = mock.providerCatalog({
      providerConnections: [mock.providerConnection({ id: "pc-1" })],
      providerRoles: [
        mock.providerRole({ providerConnectionId: "pc-1", accessLevel: "read-only" }),
      ],
    });
    const result = validateProviderRefs(noRoleForLevel, {
      providerConnectionId: "pc-1",
      bucketName: "mock-bucket",
      grants: [{ accessLevel: "read-write", scope: "lab" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["grants.0.accessLevel"]).toEqual([
        'No storage role for access level "read-write" on this bucket',
      ]);
    }
  });
});

describe("applyBucketGrantSet", () => {
  test("assembles the grant set from the bucket's persisted rows and applies via the given connection", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(catalog);
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([
      mock.connectionConfig({
        bucketName: "b",
        grants: [mock.connectionGrant({ scope: "lab", accessLevel: "read-write" })],
      }),
    ]);

    const bucket = { organization: "org1", providerConnectionId: "pc-mock", bucketName: "b" };
    const outcome = await applyBucketGrantSet(bucket, mock.connectionConfig(), {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });

    expect(prisma.connectionConfig.findMany).toHaveBeenCalledWith({
      where: bucket,
      include: { grants: true },
    });
    expect(["applied", "drifted", "error"]).toContain(outcome.status);
  });

  test("borrows a sharing-capable role from another connection on the same bucket when the share's own grants are read-only", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([
      mock.connectionConfig({
        name: "share",
        bucketName: "b",
        providerConnectionId: "pc-mock",
        grants: [mock.connectionGrant({ scope: "lab", accessLevel: "read-only" })],
      }),
      mock.connectionConfig({
        name: "owner",
        bucketName: "b",
        providerConnectionId: "pc-mock",
        grants: [mock.connectionGrant({ scope: "admin", accessLevel: "admin" })],
      }),
    ]);
    vi.mocked(applyBucketPolicy).mockResolvedValue({ status: "applied" });

    const bucket = { organization: "org1", providerConnectionId: "pc-mock", bucketName: "b" };
    const shareConfig = mock.connectionConfig({
      name: "share",
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [mock.connectionGrant({ scope: "lab", accessLevel: "read-only" })],
    });
    const outcome = await applyBucketGrantSet(bucket, shareConfig, {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });

    expect(outcome.status).toBe("applied");
    expect(vi.mocked(applyBucketPolicy).mock.calls[0][0].roleArn).toBe(
      "arn:aws:iam::123456789012:role/admin",
    );
  });

  test("the grants handed to applyBucketPolicy keep each grant's OWN catalog-resolved roleArn (read-only `*` + internal admin), and the write session uses the admin role", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([
      mock.connectionConfig({
        name: "conn",
        bucketName: "b",
        providerConnectionId: "pc-mock",
        grants: [
          mock.connectionGrant({ scope: "*", accessLevel: "read-only" }),
          mock.connectionGrant({ scope: "internal", accessLevel: "admin" }),
        ],
      }),
    ]);
    vi.mocked(applyBucketPolicy).mockResolvedValue({ status: "applied" });

    const bucket = { organization: "org1", providerConnectionId: "pc-mock", bucketName: "b" };
    const config = mock.connectionConfig({
      name: "conn",
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [
        mock.connectionGrant({ scope: "*", accessLevel: "read-only" }),
        mock.connectionGrant({ scope: "internal", accessLevel: "admin" }),
      ],
    });
    const outcome = await applyBucketGrantSet(bucket, config, {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });

    expect(outcome.status).toBe("applied");

    // Write session (ApplyTarget) is minted under the Admin-level role.
    expect(vi.mocked(applyBucketPolicy).mock.calls[0][0].roleArn).toBe(
      "arn:aws:iam::123456789012:role/admin",
    );

    // Grants keep their own role ARNs — the write-session role never leaks
    // into the bucket-policy Principals.
    const appliedGrants = vi.mocked(applyBucketPolicy).mock.calls[0][1];
    const byScope = new Map(appliedGrants.map((g) => [g.groupPath, g]));
    expect(byScope.get("*")?.roleArn).toBe("arn:aws:iam::123456789012:role/read-only");
    expect(byScope.get("*")?.accessLevel).toBe("read-only");
    expect(byScope.get("internal")?.roleArn).toBe("arn:aws:iam::123456789012:role/admin");
    expect(byScope.get("internal")?.accessLevel).toBe("admin");
  });
});

describe("resolveApplyTarget", () => {
  test("prefers a sharing-capable grant's role for the write session even when a read-only grant comes first", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    const config = mock.connectionConfig({
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [
        mock.connectionGrant({ scope: "lab", accessLevel: "read-only" }),
        mock.connectionGrant({ scope: "ops", accessLevel: "admin" }),
      ],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.roleArn).toBe("arn:aws:iam::123456789012:role/admin");
    }
  });

  test("falls back to the first resolvable grant when none allows sharing", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    const config = mock.connectionConfig({
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [mock.connectionGrant({ scope: "lab", accessLevel: "read-only" })],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.roleArn).toBe("arn:aws:iam::123456789012:role/read-only");
    }
  });

  test("returns an error when every grant's level has no role in the catalog", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    const config = mock.connectionConfig({
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [mock.connectionGrant({ scope: "lab", accessLevel: "annotate" })],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(false);
  });

  test("returns an error when the catalog is unavailable", async () => {
    vi.mocked(getProviderCatalog).mockRejectedValueOnce(new Error("catalog down"));
    const config = mock.connectionConfig({
      bucketName: "b",
      grants: [mock.connectionGrant({ scope: "lab", accessLevel: "read-write" })],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/catalog down/i);
  });
});

describe("validateBucketRef (C-343)", () => {
  test("accepts a registered bucket under the chosen provider connection", async () => {
    vi.mocked(getBucketCatalog).mockResolvedValue(
      mock.bucketCatalog({
        buckets: [mock.bucketLookupRow({ providerConnectionId: "pc-1", bucketName: "my-bucket" })],
      }),
    );
    const result = await validateBucketRef("org1", "tok", {
      providerConnectionId: "pc-1",
      bucketName: "my-bucket",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects a bucket not registered under the chosen provider connection", async () => {
    vi.mocked(getBucketCatalog).mockResolvedValue(
      mock.bucketCatalog({
        buckets: [mock.bucketLookupRow({ providerConnectionId: "pc-1", bucketName: "my-bucket" })],
      }),
    );
    const result = await validateBucketRef("org1", "tok", {
      providerConnectionId: "pc-1",
      bucketName: "other-bucket",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && "errors" in result) {
      expect(result.errors.bucketName).toBeDefined();
    }
  });

  test("returns a formError when the bucket lookup is unavailable (no free-text fallback)", async () => {
    vi.mocked(getBucketCatalog).mockRejectedValue(new Error("portal down"));
    const result = await validateBucketRef("org1", "tok", {
      providerConnectionId: "pc-1",
      bucketName: "my-bucket",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && "formError" in result) {
      expect(result.formError).toBe("portal down");
    }
  });
});
