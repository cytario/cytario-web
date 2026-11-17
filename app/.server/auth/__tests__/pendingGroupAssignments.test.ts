import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  applyPendingGroupAssignments,
  createPendingGroupAssignments,
} from "../pendingGroupAssignments";

vi.mock("../../db/prisma", () => ({
  prisma: {
    pendingGroupAssignment: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../keycloakAdmin", () => ({
  addUserToOrganizationGroup: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  findOrganizationByAlias: vi.fn(),
  findOrganizationGroupByPath: vi.fn(),
}));

const { prisma } = await import("../../db/prisma");
const { addUserToOrganizationGroup, findOrganizationByAlias, findOrganizationGroupByPath } =
  await import("../keycloakAdmin");

const user = {
  sub: "user-1",
  email: "User@Example.com",
  email_verified: true,
  organizations: { acme: { groups: [], attributes: {} } },
} as unknown as Parameters<typeof applyPendingGroupAssignments>[0];

function pendingRow(id: string, groupPath: string, organization = "acme") {
  return {
    id,
    organization,
    email: "user@example.com",
    groupPath,
    invitedBy: "admin-1",
    createdAt: new Date(),
  };
}

describe("createPendingGroupAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("lowercases emails and writes one row per email and deduplicated path", async () => {
    await createPendingGroupAssignments(
      "acme",
      ["User@Example.com ", "user@example.com", "other@example.com"],
      ["vericura", "vericura", "lab"],
      "admin-1",
    );

    expect(prisma.pendingGroupAssignment.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.pendingGroupAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization: "acme",
          email: "user@example.com",
          groupPath: "vericura",
          invitedBy: "admin-1",
        },
        { organization: "acme", email: "user@example.com", groupPath: "lab", invitedBy: "admin-1" },
        {
          organization: "acme",
          email: "other@example.com",
          groupPath: "vericura",
          invitedBy: "admin-1",
        },
        {
          organization: "acme",
          email: "other@example.com",
          groupPath: "lab",
          invitedBy: "admin-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  test("writes nothing for an empty path list", async () => {
    await createPendingGroupAssignments("acme", ["u@example.com"], [], "admin-1");

    expect(prisma.pendingGroupAssignment.createMany).not.toHaveBeenCalled();
  });

  test("writes nothing for an empty email list", async () => {
    await createPendingGroupAssignments("acme", [], ["lab"], "admin-1");

    expect(prisma.pendingGroupAssignment.createMany).not.toHaveBeenCalled();
  });
});

describe("applyPendingGroupAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findOrganizationByAlias).mockImplementation(async (alias) => ({
      id: `${alias}-uuid`,
      alias,
      name: alias,
    }));
    vi.mocked(findOrganizationGroupByPath).mockImplementation(async (_orgId, path) => ({
      id: `g-${path}`,
      name: path,
      path: `/${path}`,
      subGroups: [],
    }));
  });

  test("returns false when there are no rows", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([]);

    expect(await applyPendingGroupAssignments(user, ["acme"])).toBe(false);
    expect(addUserToOrganizationGroup).not.toHaveBeenCalled();
  });

  test("ignores an unverified email", async () => {
    const unverified = { ...user, email_verified: false };

    expect(await applyPendingGroupAssignments(unverified, ["acme"])).toBe(false);
    expect(prisma.pendingGroupAssignment.findMany).not.toHaveBeenCalled();
  });

  test("ignores a user without member organizations", async () => {
    expect(await applyPendingGroupAssignments(user, [])).toBe(false);
    expect(prisma.pendingGroupAssignment.findMany).not.toHaveBeenCalled();
  });

  test("resolves the organization id from its alias before group lookups", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      pendingRow("row-1", "vericura"),
      pendingRow("row-2", "lab"),
    ]);

    expect(await applyPendingGroupAssignments(user, ["acme"])).toBe(true);
    expect(findOrganizationByAlias).toHaveBeenCalledWith("acme");
    expect(findOrganizationGroupByPath).toHaveBeenCalledWith("acme-uuid", "vericura");
    expect(addUserToOrganizationGroup).toHaveBeenCalledTimes(2);
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("acme-uuid", "g-vericura", "user-1");
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("acme-uuid", "g-lab", "user-1");
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-1", "row-2"] } },
    });
  });

  test("queries and prunes only the given member organizations, case-insensitively", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([]);

    await applyPendingGroupAssignments(user, ["acme", "beta"]);

    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenCalledWith({
      where: { organization: { in: ["acme", "beta"] }, createdAt: { lt: expect.any(Date) } },
    });
    expect(prisma.pendingGroupAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization: { in: ["acme", "beta"] }, email: "user@example.com" },
      }),
    );
  });

  test("applies each organization's rows under that organization's id", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      pendingRow("row-1", "vericura", "acme"),
      pendingRow("row-2", "lab", "beta"),
    ]);

    expect(await applyPendingGroupAssignments(user, ["acme", "beta"])).toBe(true);
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("acme-uuid", "g-vericura", "user-1");
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("beta-uuid", "g-lab", "user-1");
  });

  test("drops rows whose group no longer exists", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      pendingRow("row-1", "gone"),
    ]);
    vi.mocked(findOrganizationGroupByPath).mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, ["acme"])).toBe(false);
    expect(addUserToOrganizationGroup).not.toHaveBeenCalled();
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-1"] } },
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("keeps a row whose group add fails for the next login", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      pendingRow("row-1", "vericura"),
      pendingRow("row-2", "lab"),
    ]);
    vi.mocked(addUserToOrganizationGroup).mockRejectedValueOnce(new Error("kc down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, ["acme"])).toBe(true);
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-2"] } },
    });
    error.mockRestore();
  });

  test("keeps rows when the organization cannot be resolved", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      pendingRow("row-1", "vericura"),
    ]);
    vi.mocked(findOrganizationByAlias).mockResolvedValue(undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, ["acme"])).toBe(false);
    expect(addUserToOrganizationGroup).not.toHaveBeenCalled();
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  test("a failing organization does not block the others", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      pendingRow("row-1", "vericura", "acme"),
      pendingRow("row-2", "lab", "beta"),
    ]);
    vi.mocked(findOrganizationByAlias).mockImplementation(async (alias) => {
      if (alias === "acme") throw new Error("kc down");
      return { id: `${alias}-uuid`, alias, name: alias };
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, ["acme", "beta"])).toBe(true);
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("beta-uuid", "g-lab", "user-1");
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-2"] } },
    });
    error.mockRestore();
  });
});
