import { describe, expect, test, vi } from "vitest";

import { assertGroupsInScope } from "../assertGroupsInScope";

const mockFindOrganizationByAlias = vi.fn();
const mockFindOrganizationGroupByPath = vi.fn();
const mockFetchOrgGroupTree = vi.fn();

vi.mock("~/.server/auth/keycloakAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/keycloakAdmin")>();
  return {
    ...actual,
    findOrganizationByAlias: (...args: unknown[]) => mockFindOrganizationByAlias(...args),
    findOrganizationGroupByPath: (...args: unknown[]) => mockFindOrganizationGroupByPath(...args),
    fetchOrgGroupTree: (...args: unknown[]) => mockFetchOrgGroupTree(...args),
  };
});

const mockOrg = { id: "org-uuid", name: "Acme", alias: "acme" };

const labTree = {
  id: "g1",
  name: "lab",
  path: "/lab",
  subGroups: [
    { id: "g2", name: "team-x", path: "/lab/team-x", subGroups: [] },
    { id: "g3", name: "admins", path: "/lab/admins", subGroups: [] },
  ],
};

const rndTree = {
  id: "g4",
  name: "rnd",
  path: "/rnd",
  subGroups: [],
};

describe("assertGroupsInScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOrganizationByAlias.mockResolvedValue(mockOrg);
  });

  test("passes when group is the scope root", async () => {
    mockFindOrganizationGroupByPath.mockResolvedValue(labTree);
    mockFetchOrgGroupTree.mockResolvedValue(labTree);

    await expect(assertGroupsInScope(["g1"], "lab", "acme")).resolves.toBeUndefined();
    expect(mockFindOrganizationGroupByPath).toHaveBeenCalledWith("org-uuid", "lab");
    expect(mockFetchOrgGroupTree).toHaveBeenCalledWith("org-uuid", labTree);
  });

  test("passes when group is a subgroup of the scope", async () => {
    mockFindOrganizationGroupByPath.mockResolvedValue(labTree);
    mockFetchOrgGroupTree.mockResolvedValue(labTree);

    await expect(assertGroupsInScope(["g2"], "lab", "acme")).resolves.toBeUndefined();
  });

  test("passes when multiple groups are all in scope", async () => {
    mockFindOrganizationGroupByPath.mockResolvedValue(labTree);
    mockFetchOrgGroupTree.mockResolvedValue(labTree);

    await expect(assertGroupsInScope(["g1", "g2", "g3"], "lab", "acme")).resolves.toBeUndefined();
  });

  test("passes (no API call) when groupIds array is empty", async () => {
    await expect(assertGroupsInScope([], "lab", "acme")).resolves.toBeUndefined();
    expect(mockFindOrganizationByAlias).not.toHaveBeenCalled();
  });

  test("throws 403 when group is not in scope", async () => {
    mockFindOrganizationGroupByPath.mockResolvedValue(labTree);
    mockFetchOrgGroupTree.mockResolvedValue(labTree);

    try {
      await assertGroupsInScope(["g-out-of-scope"], "lab", "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });

  test("throws 404 when scope does not exist in the org tree", async () => {
    mockFindOrganizationGroupByPath.mockResolvedValue(undefined);

    try {
      await assertGroupsInScope(["g1"], "nonexistent", "acme");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(404);
    }
  });

  test("throws 400 when the active org is missing", async () => {
    try {
      await assertGroupsInScope(["g1"], "lab", undefined);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(400);
    }
  });

  test("org-root scope walks the whole org forest via fetchOrgGroupTree", async () => {
    // No `group` arg → fetchOrgGroupTree returns the full org-root forest.
    mockFetchOrgGroupTree.mockImplementation(async (_orgId, g) =>
      g === undefined ? [labTree, rndTree] : g,
    );

    await expect(assertGroupsInScope(["g1", "g2", "g4"], "*", "acme")).resolves.toBeUndefined();
    expect(mockFetchOrgGroupTree).toHaveBeenCalledWith("org-uuid");
    expect(mockFindOrganizationGroupByPath).not.toHaveBeenCalled();
  });
});
