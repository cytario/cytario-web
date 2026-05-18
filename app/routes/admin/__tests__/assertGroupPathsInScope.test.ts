import { describe, expect, test, vi } from "vitest";

import { assertGroupPathsInScope } from "../assertGroupPathsInScope";

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
  name: "acme",
  path: "acme",
  members: [],
  subGroups: [
    {
      id: "g2",
      name: "lab",
      path: "acme/lab",
      members: [],
      subGroups: [
        {
          id: "g4",
          name: "team-x",
          path: "acme/lab/team-x",
          members: [],
          subGroups: [],
        },
      ],
    },
    {
      id: "g3",
      name: "admins",
      path: "acme/admins",
      members: [],
      subGroups: [],
    },
  ],
};

describe("assertGroupPathsInScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("passes when path is the scope root", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(assertGroupPathsInScope(["acme"], "acme")).resolves.toBeUndefined();
  });

  test("passes when path is a subgroup", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(assertGroupPathsInScope(["acme/lab"], "acme")).resolves.toBeUndefined();
  });

  test("passes when path is a deeply nested subgroup", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(assertGroupPathsInScope(["acme/lab/team-x"], "acme")).resolves.toBeUndefined();
  });

  test("passes when multiple paths are all in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupPathsInScope(["acme", "acme/lab", "acme/lab/team-x"], "acme"),
    ).resolves.toBeUndefined();
  });

  test("passes (no API call) when groupPaths array is empty", async () => {
    await expect(assertGroupPathsInScope([], "acme")).resolves.toBeUndefined();

    expect(mockGetGroupWithMembers).not.toHaveBeenCalled();
  });

  test("throws 403 for a nonexistent path that is prefixed by the scope", async () => {
    // This is the key improvement over the old prefix-only check:
    // "acme/nonexistent" would pass a naive prefix match, but it's not a
    // real group. The tree-based check catches it.
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupPathsInScope(["acme/nonexistent"], "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 403 for a path outside the scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupPathsInScope(["another-org/foo"], "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 403 when one of multiple paths is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupPathsInScope(["acme/lab", "another-org/foo"], "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 404 when scope does not exist", async () => {
    mockGetGroupWithMembers.mockResolvedValue(undefined);

    try {
      await assertGroupPathsInScope(["acme/lab"], "nonexistent");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(404);
    }
  });
});
