import { describe, expect, test, vi } from "vitest";

import { prisma } from "~/.server/db/prisma";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { compileGrantStatements } from "~/.server/storage/bucketPolicy";
import { applyBucketPolicy } from "~/.server/storage/bucketPolicyApply.server";
import {
  applyBucketGrantSet,
  applyConnectionGrants,
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
  providerRoles: [mock.providerRole({ id: "pr-mock", providerConnectionId: "pc-mock", roleArn })],
});

const shareableCatalog = mock.providerCatalog({
  providerConnections: [mock.providerConnection({ id: "pc-mock" })],
  providerRoles: [
    mock.providerRole({
      id: "pr-ro",
      providerConnectionId: "pc-mock",
      roleArn: "arn:aws:iam::123456789012:role/read-only",
      allowsSharing: false,
    }),
    mock.providerRole({
      id: "pr-rw",
      providerConnectionId: "pc-mock",
      roleArn: "arn:aws:iam::123456789012:role/read-write",
      allowsSharing: true,
    }),
  ],
});

describe("grantForConnection", () => {
  test("produces an ORG-conditioned, per-group-conditioned statement (fail-closed generator accepts it)", () => {
    const grant = grantForConnection(
      { organization: "acme", bucketName: "shared", prefix: "images" },
      { scope: "lab/team-a" },
      roleArn,
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
});

describe("assembleBucketGrants", () => {
  test("flattens grants from all connections and resolves role ARNs from the catalog", () => {
    const configs = [
      mock.connectionConfig({
        name: "a",
        bucketName: "b",
        grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-mock" })],
      }),
      mock.connectionConfig({
        name: "d",
        bucketName: "b",
        grants: [
          mock.connectionGrant({ scope: "lab/team-b", providerRoleId: "pr-mock" }),
          mock.connectionGrant({ scope: "lab/team-c", providerRoleId: "pr-mock" }),
        ],
      }),
    ];
    const grants = assembleBucketGrants(configs, catalog);
    expect(grants.map((g) => g.groupPath).sort()).toEqual(["lab", "lab/team-b", "lab/team-c"]);
    for (const g of grants) {
      expect(g.roleArn).toBe(roleArn);
    }
  });

  test("skips grants whose provider role is stale (absent from the catalog)", () => {
    const configs = [
      mock.connectionConfig({
        name: "a",
        bucketName: "b",
        grants: [
          mock.connectionGrant({ scope: "lab", providerRoleId: "pr-mock" }),
          mock.connectionGrant({ scope: "ops", providerRoleId: "pr-stale" }),
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

  test("accepts a grant whose role covers the submitted scope", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      grants: [{ providerRoleId: "pr-lab", scope: "lab/team-a" }],
    });
    expect(result.ok).toBe(true);
  });

  test("accepts multiple grants with different roles", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      grants: [
        { providerRoleId: "pr-lab", scope: "lab/team-a" },
        { providerRoleId: "pr-ro", scope: "ops" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an unknown provider connection", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-nope",
      grants: [{ providerRoleId: "pr-lab", scope: "lab" }],
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
      grants: [{ providerRoleId: "pr-lab", scope: "lab" }],
    });
    expect(result.ok).toBe(false);
  });

  test("SECURITY: rejects a role whose allowed scopes do not cover the submitted scope — client filtering is advisory only", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      grants: [{ providerRoleId: "pr-lab", scope: "ops" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["grants.0.providerRoleId"]).toBeDefined();
    }
  });

  test("a `*` allowed scope covers every submitted scope", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      grants: [{ providerRoleId: "pr-ro", scope: "anything/at/all" }],
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
      grants: [{ providerRoleId: "pr-org-wide", scope: "any/group/scope" }],
    });
    expect(result.ok).toBe(true);
  });

  test("requireSharing rejects a non-sharing role", () => {
    const result = validateProviderRefs(
      catalog,
      { providerConnectionId: "pc-1", grants: [{ providerRoleId: "pr-ro", scope: "lab" }] },
      { requireSharing: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["grants.0.providerRoleId"]).toBeDefined();
    }
  });

  test("C-347: returns per-grant errors keyed by grants.<index>.providerRoleId", () => {
    const result = validateProviderRefs(catalog, {
      providerConnectionId: "pc-1",
      grants: [
        { providerRoleId: "pr-lab", scope: "lab" },
        { providerRoleId: "pr-lab", scope: "ops" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["grants.1.providerRoleId"]).toBeDefined();
      expect(result.errors["grants.0.providerRoleId"]).toBeUndefined();
    }
  });
});

describe("applyBucketGrantSet", () => {
  test("assembles the grant set from the bucket's persisted rows and applies via the given connection", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(catalog);
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([
      mock.connectionConfig({
        bucketName: "b",
        grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-mock" })],
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
        grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-ro" })],
      }),
      mock.connectionConfig({
        name: "owner",
        bucketName: "b",
        providerConnectionId: "pc-mock",
        grants: [mock.connectionGrant({ scope: "admin", providerRoleId: "pr-rw" })],
      }),
    ]);
    vi.mocked(applyBucketPolicy).mockResolvedValue({ status: "applied" });

    const bucket = { organization: "org1", providerConnectionId: "pc-mock", bucketName: "b" };
    const shareConfig = mock.connectionConfig({
      name: "share",
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-ro" })],
    });
    const outcome = await applyBucketGrantSet(bucket, shareConfig, {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });

    expect(outcome.status).toBe("applied");
    expect(vi.mocked(applyBucketPolicy).mock.calls[0][0].roleArn).toBe(
      "arn:aws:iam::123456789012:role/read-write",
    );
  });
});

describe("applyConnectionGrants — advisory degradation", () => {
  test("returns an error outcome (never throws, never blocks) when the catalog is unavailable", async () => {
    vi.mocked(getProviderCatalog).mockRejectedValueOnce(new Error("catalog down"));
    const config = mock.connectionConfig({
      bucketName: "b",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-mock" })],
    });
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
    const config = mock.connectionConfig({
      bucketName: "b",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-mock" })],
    });
    const outcome = await applyConnectionGrants(config, [], {
      user: mock.user(),
      idToken: "tok",
      accessToken: "acc",
    });
    expect(outcome.status).toBe("error");
  });
});

describe("resolveApplyTarget", () => {
  test("prefers a sharing-capable grant's role for the write session even when a read-only grant comes first", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    const config = mock.connectionConfig({
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [
        mock.connectionGrant({ scope: "lab", providerRoleId: "pr-ro" }),
        mock.connectionGrant({ scope: "ops", providerRoleId: "pr-rw" }),
      ],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.roleArn).toBe("arn:aws:iam::123456789012:role/read-write");
    }
  });

  test("falls back to the first resolvable grant when none allows sharing", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    const config = mock.connectionConfig({
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-ro" })],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.roleArn).toBe("arn:aws:iam::123456789012:role/read-only");
    }
  });

  test("returns an error when every grant's provider role is stale", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(shareableCatalog);
    const config = mock.connectionConfig({
      bucketName: "b",
      providerConnectionId: "pc-mock",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-stale" })],
    });
    const result = await resolveApplyTarget(config, "tok");
    expect(result.ok).toBe(false);
  });

  test("returns an error when the catalog is unavailable", async () => {
    vi.mocked(getProviderCatalog).mockRejectedValueOnce(new Error("catalog down"));
    const config = mock.connectionConfig({
      bucketName: "b",
      grants: [mock.connectionGrant({ scope: "lab", providerRoleId: "pr-rw" })],
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
