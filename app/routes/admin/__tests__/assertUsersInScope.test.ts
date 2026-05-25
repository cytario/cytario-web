import { describe, expect, test, vi } from "vitest";

import { assertUsersInScope } from "../assertUsersInScope";

const mockFindOrganizationByAlias = vi.fn();
const mockGetGroupWithMembers = vi.fn();

vi.mock("~/.server/auth/keycloakAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/keycloakAdmin")>();
  return {
    ...actual,
    findOrganizationByAlias: (...args: unknown[]) => mockFindOrganizationByAlias(...args),
    getGroupWithMembers: (...args: unknown[]) => mockGetGroupWithMembers(...args),
  };
});

const mockOrg = { id: "org-uuid", name: "Acme", alias: "acme" };

const mockGroupWithMembers = {
  id: "g1",
  name: "lab",
  path: "lab",
  members: [
    {
      id: "user-1",
      username: "alice",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "A",
      enabled: true,
    },
  ],
  subGroups: [
    {
      id: "g2",
      name: "team-x",
      path: "lab/team-x",
      members: [
        {
          id: "user-2",
          username: "bob",
          email: "bob@example.com",
          firstName: "Bob",
          lastName: "B",
          enabled: true,
        },
      ],
      subGroups: [],
    },
  ],
};

describe("assertUsersInScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOrganizationByAlias.mockResolvedValue(mockOrg);
  });

  test("passes when user is in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(assertUsersInScope(["user-1"], "lab", "acme")).resolves.toBeUndefined();
    expect(mockGetGroupWithMembers).toHaveBeenCalledWith("org-uuid", "lab");
  });

  test("passes when user is in a subgroup of the scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(assertUsersInScope(["user-2"], "lab", "acme")).resolves.toBeUndefined();
  });

  test("throws 403 when user is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertUsersInScope(["user-999"], "lab", "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 404 when scope does not exist", async () => {
    mockGetGroupWithMembers.mockResolvedValue(undefined);

    try {
      await assertUsersInScope(["user-1"], "nonexistent", "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(404);
    }
  });

  test("throws 400 when the active org is missing", async () => {
    try {
      await assertUsersInScope(["user-1"], "lab", undefined);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(400);
    }
  });

  test("passes (no API call) when userIds array is empty", async () => {
    await expect(assertUsersInScope([], "lab", "acme")).resolves.toBeUndefined();
    expect(mockFindOrganizationByAlias).not.toHaveBeenCalled();
  });
});
