import { describe, expect, test, vi } from "vitest";

import { assertGroupsInScope } from "../assertGroupsInScope";

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
      subGroups: [],
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

describe("assertGroupsInScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("passes when group is the scope root", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupsInScope(["g1"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when group is a subgroup of the scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupsInScope(["g2"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when group is the admins subgroup of the scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupsInScope(["g3"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes when multiple groups are all in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    await expect(
      assertGroupsInScope(["g1", "g2", "g3"], "vericura"),
    ).resolves.toBeUndefined();
  });

  test("passes (no API call) when groupIds array is empty", async () => {
    await expect(
      assertGroupsInScope([], "vericura"),
    ).resolves.toBeUndefined();

    expect(mockGetGroupWithMembers).not.toHaveBeenCalled();
  });

  test("throws 403 when group is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupsInScope(["g-out-of-scope"], "vericura");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 403 when one of multiple groups is not in scope", async () => {
    mockGetGroupWithMembers.mockResolvedValue(mockGroupWithMembers);

    try {
      await assertGroupsInScope(["g1", "g-out-of-scope"], "vericura");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 404 when scope does not exist", async () => {
    mockGetGroupWithMembers.mockResolvedValue(undefined);

    try {
      await assertGroupsInScope(["g1"], "nonexistent");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(404);
    }
  });
});
