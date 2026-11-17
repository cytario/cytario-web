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
  organizations: { acme: { groups: ["vericura"], attributes: {} } },
} as unknown as Parameters<typeof applyPendingGroupAssignments>[0];

describe("createPendingGroupAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("lowercases the email and deduplicates paths", async () => {
    await createPendingGroupAssignments(
      "acme",
      "User@Example.com ",
      ["vericura", "vericura", "lab"],
      "admin-1",
    );

    expect(prisma.pendingGroupAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization: "acme",
          email: "user@example.com",
          groupPath: "vericura",
          invitedBy: "admin-1",
        },
        { organization: "acme", email: "user@example.com", groupPath: "lab", invitedBy: "admin-1" },
      ],
      skipDuplicates: true,
    });
  });

  test("writes nothing for an empty path list", async () => {
    await createPendingGroupAssignments("acme", "u@example.com", [], "admin-1");

    expect(prisma.pendingGroupAssignment.createMany).not.toHaveBeenCalled();
  });
});

describe("applyPendingGroupAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findOrganizationByAlias).mockResolvedValue({
      id: "org-1",
      alias: "acme",
      name: "acme",
    });
    vi.mocked(findOrganizationGroupByPath).mockImplementation(async (_orgId, path) => ({
      id: `g-${path}`,
      name: path,
      path: `/${path}`,
      subGroups: [],
    }));
  });

  test("returns false when there are no rows", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([]);

    expect(await applyPendingGroupAssignments(user, "acme")).toBe(false);
    expect(addUserToOrganizationGroup).not.toHaveBeenCalled();
  });

  test("ignores an unverified email", async () => {
    const unverified = { ...user, email_verified: false };

    expect(await applyPendingGroupAssignments(unverified, "acme")).toBe(false);
    expect(prisma.pendingGroupAssignment.findMany).not.toHaveBeenCalled();
  });

  test("adds the user to each group, deletes applied rows by id, returns true", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      {
        id: "row-1",
        organization: "acme",
        email: "user@example.com",
        groupPath: "vericura",
        invitedBy: "admin-1",
        createdAt: new Date(),
      },
      {
        id: "row-2",
        organization: "acme",
        email: "user@example.com",
        groupPath: "lab",
        invitedBy: "admin-1",
        createdAt: new Date(),
      },
    ]);

    expect(await applyPendingGroupAssignments(user, "acme")).toBe(true);
    expect(addUserToOrganizationGroup).toHaveBeenCalledTimes(2);
    expect(findOrganizationByAlias).toHaveBeenCalledWith("acme");
    expect(findOrganizationGroupByPath).toHaveBeenCalledWith("org-1", "vericura");
    expect(addUserToOrganizationGroup).toHaveBeenCalledWith("org-1", "g-vericura", "user-1");
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-1", "row-2"] } },
    });
  });

  test("drops rows whose group no longer exists", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      {
        id: "row-1",
        organization: "acme",
        email: "user@example.com",
        groupPath: "gone",
        invitedBy: "admin-1",
        createdAt: new Date(),
      },
    ]);
    vi.mocked(findOrganizationGroupByPath).mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, "acme")).toBe(false);
    expect(addUserToOrganizationGroup).not.toHaveBeenCalled();
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-1"] } },
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("keeps a row whose group add fails for the next login", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      {
        id: "row-1",
        organization: "acme",
        email: "user@example.com",
        groupPath: "vericura",
        invitedBy: "admin-1",
        createdAt: new Date(),
      },
      {
        id: "row-2",
        organization: "acme",
        email: "user@example.com",
        groupPath: "lab",
        invitedBy: "admin-1",
        createdAt: new Date(),
      },
    ]);
    vi.mocked(addUserToOrganizationGroup).mockRejectedValueOnce(new Error("kc down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, "acme")).toBe(true);
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["row-2"] } },
    });
    error.mockRestore();
  });

  test("matches case-insensitively against stored rows", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([]);

    await applyPendingGroupAssignments(user, "acme");

    expect(prisma.pendingGroupAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization: "acme", email: "user@example.com" },
      }),
    );
  });

  test("keeps rows when the organization cannot be resolved", async () => {
    vi.mocked(prisma.pendingGroupAssignment.findMany).mockResolvedValue([
      {
        id: "row-1",
        organization: "acme",
        email: "user@example.com",
        groupPath: "vericura",
        invitedBy: "admin-1",
        createdAt: new Date(),
      },
    ]);
    vi.mocked(findOrganizationByAlias).mockResolvedValue(undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await applyPendingGroupAssignments(user, "acme")).toBe(false);
    expect(addUserToOrganizationGroup).not.toHaveBeenCalled();
    expect(prisma.pendingGroupAssignment.deleteMany).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
