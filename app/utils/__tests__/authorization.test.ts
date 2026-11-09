import mock from "~/utils/__tests__/__mocks__";
import {
  adminCovers,
  adminScopesCover,
  canCreate,
  canModify,
  canSee,
  filterVisible,
} from "~/utils/authorization";

describe("adminCovers", () => {
  test("org-root sentinel covers everything", () => {
    expect(adminCovers("*", "anything/deep")).toBe(true);
  });

  test("exact match covers", () => {
    expect(adminCovers("lab", "lab")).toBe(true);
  });

  test("ancestor covers descendant", () => {
    expect(adminCovers("lab", "lab/team-x")).toBe(true);
  });

  test("does not cover a sibling with a shared prefix", () => {
    expect(adminCovers("lab", "lab-extra")).toBe(false);
  });

  test("descendant does not cover ancestor", () => {
    expect(adminCovers("lab/team-x", "lab")).toBe(false);
  });
});

describe("adminScopesCover", () => {
  test("any covering admin scope authorizes the target", () => {
    expect(adminScopesCover(["other", "lab"], "lab/team-x")).toBe(true);
  });

  test("no covering admin scope rejects the target", () => {
    expect(adminScopesCover(["lab"], "other/team")).toBe(false);
  });

  test("the `*` target is only coverable by an org-root admin", () => {
    expect(adminScopesCover(["*"], "*")).toBe(true);
    expect(adminScopesCover(["lab"], "*")).toBe(false);
  });

  test("empty admin scopes authorize nothing", () => {
    expect(adminScopesCover([], "lab")).toBe(false);
  });
});

const inOrg = (ownerScope: string, organization = "org1") => ({ organization, ownerScope });

/**
 * Builds a member of `alias` whose DERIVED entitlements match the given
 * groups/adminScopes: the authorization predicates derive entitlements from
 * the membership map, so the tests seed memberships, not projections. An
 * admin scope `X` is carried as the `X/admins` group path (root `*` as
 * `admins`) — exactly what deriveGroupScopes splits back out.
 */
function member(
  alias: string,
  sub: string,
  groups: string[],
  adminScopes: string[],
  organizations: Record<string, { groups: string[]; attributes: Record<string, never> }> = {},
) {
  const membershipGroups = [
    ...groups,
    ...adminScopes.map((scope) => (scope === "*" ? "admins" : `${scope}/admins`)),
  ];
  return mock.user({
    sub,
    organizations: {
      ...organizations,
      [alias]: { groups: membershipGroups, attributes: {} },
    },
  });
}

describe("canSee", () => {
  test("org-root admin (* admin scope) sees every scope in the active org", () => {
    const user = member("org1", "admin-1", [], ["*"]);

    expect(canSee(user, inOrg("lab/team-x"), "org1")).toBe(true);
    expect(canSee(user, inOrg("anything"), "org1")).toBe(true);
  });

  test("org-root admin does NOT see resources in other orgs", () => {
    const user = member("vericura", "admin-1", [], ["*"]);

    expect(canSee(user, { organization: "ascent-pharma", ownerScope: "lab" }, "vericura")).toBe(
      false,
    );
  });

  test("user can see personal scope", () => {
    const user = member("org1", "user-123", [], []);

    expect(canSee(user, inOrg("user-123"), "org1")).toBe(true);
  });

  test("group member can see matching scope", () => {
    const user = member("org1", "user-1", ["lab/team-x"], []);

    expect(canSee(user, inOrg("lab/team-x"), "org1")).toBe(true);
  });

  test("admin of parent scope can see descendant", () => {
    const user = member("org1", "user-1", ["lab/admins"], ["lab"]);

    expect(canSee(user, inOrg("lab/team-x"), "org1")).toBe(true);
    expect(canSee(user, inOrg("lab/team-y"), "org1")).toBe(true);
    expect(canSee(user, inOrg("lab"), "org1")).toBe(true);
  });

  test("group member can see ancestor scopes", () => {
    const user = member("org1", "user-1", ["lab/team-x"], []);

    expect(canSee(user, inOrg("lab"), "org1")).toBe(true);
  });

  test("non-member and non-admin cannot see", () => {
    const user = member("org1", "user-1", ["lab/team-x"], []);

    expect(canSee(user, inOrg("rnd"), "org1")).toBe(false);
    expect(canSee(user, inOrg("lab/team-y"), "org1")).toBe(false);
  });

  test("scope prefix must match at boundary (no partial match)", () => {
    const user = member("org1", "user-1", ["lab/admins"], ["lab"]);

    expect(canSee(user, inOrg("laboratory/team-x"), "org1")).toBe(false);
    expect(canSee(user, inOrg("lab/team-x"), "org1")).toBe(true);
  });

  test("resource from another organization is invisible even with matching scope", () => {
    const user = member("vericura", "user-1", ["lab"], ["lab"]);

    expect(canSee(user, { organization: "ascent-pharma", ownerScope: "lab" }, "vericura")).toBe(
      false,
    );
  });

  test("org-root-owned resources are visible to every active-org member", () => {
    const user = member("org1", "user-1", ["lab"], []);

    expect(canSee(user, inOrg("*"), "org1")).toBe(true);
  });

  test("org-root-owned resources are NOT visible to users from another org", () => {
    const user = member("vericura", "user-1", ["lab"], []);

    expect(canSee(user, { organization: "ascent-pharma", ownerScope: "*" }, "vericura")).toBe(
      false,
    );
  });

  test("user without a request organization sees nothing", () => {
    const user = member("org1", "user-1", ["lab"], ["lab"], {});

    expect(canSee(user, inOrg("lab"), undefined)).toBe(false);
  });
});

describe("canModify", () => {
  test("org-root admin can modify any scope in the active org", () => {
    const user = member("org1", "admin-1", [], ["*"]);

    expect(canModify(user, inOrg("lab/team-x"), "org1")).toBe(true);
  });

  test("user can modify personal scope", () => {
    const user = member("org1", "user-123", [], []);

    expect(canModify(user, inOrg("user-123"), "org1")).toBe(true);
  });

  test("admin of parent scope can modify descendant", () => {
    const user = member("org1", "user-1", ["lab/admins"], ["lab"]);

    expect(canModify(user, inOrg("lab/team-x"), "org1")).toBe(true);
    expect(canModify(user, inOrg("lab"), "org1")).toBe(true);
  });

  test("group member (non-admin) CANNOT modify", () => {
    const user = member("org1", "user-1", ["lab/team-x"], []);

    expect(canModify(user, inOrg("lab/team-x"), "org1")).toBe(false);
  });

  test("rejects resources from another organization", () => {
    const user = member("vericura", "admin-1", [], ["lab"]);

    expect(canModify(user, { organization: "ascent-pharma", ownerScope: "lab" }, "vericura")).toBe(
      false,
    );
  });

  test("non-admin org member cannot modify org-root-owned resources", () => {
    const user = member("org1", "user-1", ["lab"], []);

    expect(canModify(user, inOrg("*"), "org1")).toBe(false);
  });
});

describe("canCreate", () => {
  test("org-root admin can create in any scope in the active org", () => {
    const user = member("org1", "admin-1", [], ["*"]);

    expect(canCreate(user, inOrg("lab/team-x"), "org1")).toBe(true);
    expect(canCreate(user, inOrg("anything"), "org1")).toBe(true);
  });

  test("personal scope is always allowed", () => {
    const user = member("org1", "user-123", [], []);

    expect(canCreate(user, inOrg("user-123"), "org1")).toBe(true);
  });

  test("admin can create in their admin scope and descendants", () => {
    const user = member("org1", "user-1", ["lab/admins"], ["lab"]);

    expect(canCreate(user, inOrg("lab"), "org1")).toBe(true);
    expect(canCreate(user, inOrg("lab/team-x"), "org1")).toBe(true);
    expect(canCreate(user, inOrg("lab/team-x/sub-team"), "org1")).toBe(true);
  });

  test("admin scope boundary is respected (no partial match)", () => {
    const user = member("org1", "user-1", ["lab/admins"], ["lab"]);

    expect(canCreate(user, inOrg("lab/team-x"), "org1")).toBe(true);
    expect(canCreate(user, inOrg("laboratory/team-x"), "org1")).toBe(false);
  });

  test("non-admin cannot create in group scope", () => {
    const user = member("org1", "user-1", ["lab/team-x"], []);

    expect(canCreate(user, inOrg("lab/team-x"), "org1")).toBe(false);
  });

  test("rejects resources from another organization", () => {
    const user = member("vericura", "admin-1", [], ["lab"]);

    expect(canCreate(user, { organization: "ascent-pharma", ownerScope: "lab" }, "vericura")).toBe(
      false,
    );
  });
});

describe("filterVisible", () => {
  test("filters resources by visibility including ancestor scopes", () => {
    const user = member("org1", "user-1", ["lab/team-x"], []);

    const resources = [
      { organization: "org1", ownerScope: "user-1", id: 1 },
      { organization: "org1", ownerScope: "lab/team-x", id: 2 },
      { organization: "org1", ownerScope: "lab", id: 3 },
      { organization: "org1", ownerScope: "rnd", id: 4 },
      { organization: "org2", ownerScope: "lab", id: 5 },
    ];

    expect(filterVisible(user, resources, "org1")).toEqual([
      { organization: "org1", ownerScope: "user-1", id: 1 },
      { organization: "org1", ownerScope: "lab/team-x", id: 2 },
      { organization: "org1", ownerScope: "lab", id: 3 },
    ]);
  });

  test("returns empty array when no resources are visible", () => {
    const user = member("org1", "user-1", [], []);

    expect(
      filterVisible(user, [{ organization: "org1", ownerScope: "lab", id: 1 }], "org1"),
    ).toEqual([]);
  });
});
