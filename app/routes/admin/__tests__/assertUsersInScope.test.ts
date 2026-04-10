import { describe, expect, test, vi } from "vitest";

import { assertUsersInScope } from "../assertUsersInScope";

const mockGetGroupWithMembers = vi.fn();

vi.mock("~/.server/auth/keycloakAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/keycloakAdmin")>();
  return {
    ...actual,
    getGroupWithMembers: (...args: unknown[]) => mockGetGroupWithMembers(...args),
  };
});

const mockGroupWithMembers = {
  id: "g1",
  name: "vericura",
  path: "vericura",
  members: [
    { id: "user-1", username: "alice", email: "alice@example.com", firstName: "Alice", lastName: "A", enabled: true },
  ],
  subGroups: [
    {
      id: "g2",
      name: "lab",
      path: "vericura/lab",
      members: [
        { id: "user-2", username: "bob", email: "bob@example.com", firstName: "Bob", lastName: "B", enabled: true },
      ],
      subGroups: [],
    },
    {
      id: "g3",
      name: "admins",
      path: "vericura/admins",
      members: [
        { id: "user-3", username: "admin", email: "admin@example.com", firstName: "Admin", lastName: "A", enabled: true },
      ],
      subGroups: [],
    },
  ],
};

describe("assertUsersInScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("passes when user is in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertUsersInScope(["user-1"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when user is in a subgroup of the scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertUsersInScope(["user-2"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when multiple users are all in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertUsersInScope(["user-1", "user-2", "user-3"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("throws 403 when user is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertUsersInScope(["user-999"], "vericura");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 403 when one of multiple users is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertUsersInScope(["user-1", "user-999"], "vericura");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 404 when scope does not exist", async () => {
    mockGetGroupWithMembers.mockResolvedValue(undefined);

    try {
      await assertUsersInScope(["user-1"], "nonexistent");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(404);
    }
  });
});
