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
  name: "vericura",
  path: "vericura",
  members: [],
  subGroups: [
    {
      id: "g2",
      name: "lab",
      path: "vericura/lab",
      members: [],
      subGroups: [
        {
          id: "g4",
          name: "team-x",
          path: "vericura/lab/team-x",
          members: [],
          subGroups: [],
        },
      ],
    },
    {
      id: "g3",
      name: "admins",
      path: "vericura/admins",
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

    await expect(
      assertGroupPathsInScope(["vericura"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when path is a subgroup", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupPathsInScope(["vericura/lab"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when path is a deeply nested subgroup", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupPathsInScope(["vericura/lab/team-x"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when multiple paths are all in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupPathsInScope(
        ["vericura", "vericura/lab", "vericura/lab/team-x"],
        "vericura",
      ),
    ).resolves.toBeUndefined();
  });

  test("passes (no API call) when groupPaths array is empty", async () => {
    await expect(
      assertGroupPathsInScope([], "vericura"),
    ).resolves.toBeUndefined();

    expect(mockGetGroupWithMembers).not.toHaveBeenCalled();
  });

  test("throws 403 for a nonexistent path that is prefixed by the scope", async () => {
    // This is the key improvement over the old prefix-only check:
    // "vericura/nonexistent" would pass a naive prefix match, but it's not a
    // real group. The tree-based check catches it.
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupPathsInScope(["vericura/nonexistent"], "vericura");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 403 for a path outside the scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupPathsInScope(["another-org/foo"], "vericura");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 403 when one of multiple paths is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupPathsInScope(
        ["vericura/lab", "another-org/foo"],
        "vericura",
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 404 when scope does not exist", async () => {
    mockGetGroupWithMembers.mockResolvedValue(undefined);

    try {
      await assertGroupPathsInScope(["vericura/lab"], "nonexistent");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(404);
    }
  });
});
