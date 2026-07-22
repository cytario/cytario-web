import { Prisma } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";
import {
  createConnection,
  uniqueViolationErrors,
} from "~/routes/connections/createConnection.action";
import { deleteConnection } from "~/routes/connections/deleteConnection.action";
import { updateConnection } from "~/routes/connections/updateConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/.server/db/redis", () => ({ redis: {} }));

// Authorization is NOT mocked — real canSee/canModify/canCreate logic runs.

const cytarioConfig = mock.connectionConfig({
  name: "test-connection",
  grants: [mock.connectionGrant({ scope: "cytario", providerRoleId: "pr-1" })],
});

const adminUser = mock.user({
  sub: "admin-user-id",
  groups: ["cytario"],
  adminScopes: ["cytario"],
});
const regularUser = mock.user({ sub: "regular-user-id", groups: ["cytario"], adminScopes: [] });
const orgRootAdmin = mock.user({ sub: "org-root-admin-id", groups: [], adminScopes: ["*"] });
const outsideUser = mock.user({
  sub: "outside-user-id",
  groups: ["other-org"],
  adminScopes: ["other-org"],
});

const validUpdates = {
  name: "updated-connection",
  bucketName: "updated-bucket",
  prefix: "",
  providerConnectionId: "pc-1",
  grants: [{ scope: "cytario", providerRoleId: "pr-1" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteConnection authorization", () => {
  test("admin of scope can delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await deleteConnection(adminUser, 1);
    expect(prisma.connectionConfig.delete).toHaveBeenCalledWith({
      where: { id: cytarioConfig.id },
    });
  });

  test("org-root admin can delete any connection within the org", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await deleteConnection(orgRootAdmin, 1);
    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("group member without admin cannot delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(deleteConnection(regularUser, 1)).rejects.toThrow(
      "Not authorized to delete this connection config",
    );
  });

  test("user from a different org cannot see or delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(deleteConnection(outsideUser, 1)).rejects.toThrow("Connection config not found");
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);
    await expect(deleteConnection(adminUser, 999)).rejects.toThrow("Connection config not found");
  });
});

describe("createConnection strictness", () => {
  // A pre-existing (org, providerConnectionId, bucketName, prefix) row must
  // surface as a unique-violation conflict — never be silently repointed to
  // the submitted scope without a canModify check on the existing row.
  test("strictly creates — an existing tuple raises P2002 instead of updating", async () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["organization", "providerConnectionId", "bucketName", "prefix"] },
    });
    vi.mocked(prisma.connectionConfig.create).mockRejectedValue(violation);

    await expect(
      createConnection(
        "org1",
        "attacker-sub",
        {
          name: "hijack",
          bucketName: "victim-bucket",
          providerConnectionId: "pc-1",
          prefix: "victim-prefix",
        },
        [{ scope: "attacker-personal-scope", providerRoleId: "pr-1" }],
      ),
    ).rejects.toBe(violation);
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("maps an unknown violation to a form error", () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["name"] },
    });
    expect(uniqueViolationErrors(violation)).toEqual({
      formError: "A database constraint was violated. Please check your input and try again.",
    });
  });

  test("maps a grant scope violation to a grants error", () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["scope"] },
    });
    expect(uniqueViolationErrors(violation)).toEqual({
      grants: ["Each group may appear at most once on a connection."],
    });
  });
});

describe("updateConnection authorization", () => {
  test("admin of scope can update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
    } as never);
    const result = await updateConnection(adminUser, 1, validUpdates);
    expect(prisma.connectionConfig.update).toHaveBeenCalled();
    expect(result.name).toBe("updated-connection");
  });

  test("group member without admin cannot update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(updateConnection(regularUser, 1, validUpdates)).rejects.toThrow(
      "Not authorized to modify this connection",
    );
  });

  test("user from a different org cannot see or update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(updateConnection(outsideUser, 1, validUpdates)).rejects.toThrow(
      "Connection not found",
    );
  });

  test("adding a new grant requires canCreate on the new scope", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(
      updateConnection(adminUser, 1, {
        ...validUpdates,
        grants: [{ scope: "ops", providerRoleId: "pr-1" }],
      }),
    ).rejects.toThrow("Not authorized to create a grant");
  });

  test("admin can add a grant for a scope they administer", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
      grants: [
        mock.connectionGrant({ scope: "cytario", providerRoleId: "pr-1" }),
        mock.connectionGrant({ scope: "cytario/sub", providerRoleId: "pr-1" }),
      ],
    } as never);
    await updateConnection(adminUser, 1, {
      ...validUpdates,
      grants: [
        { scope: "cytario", providerRoleId: "pr-1" },
        { scope: "cytario/sub", providerRoleId: "pr-1" },
      ],
    });
    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);
    await expect(updateConnection(adminUser, 999, validUpdates)).rejects.toThrow(
      "Connection not found",
    );
  });
});
