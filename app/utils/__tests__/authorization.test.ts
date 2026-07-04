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

describe("canSee", () => {
  test("org-root admin (* admin scope) sees every scope in the active org", () => {
    const user = mock.user({ sub: "admin-1", groups: [], adminScopes: ["*"] });

    expect(canSee(user, inOrg("lab/team-x"))).toBe(true);
    expect(canSee(user, inOrg("anything"))).toBe(true);
  });

  test("org-root admin does NOT see resources in other orgs", () => {
    const user = mock.user({
      sub: "admin-1",
      organization: "vericura",
      groups: [],
      adminScopes: ["*"],
    });

    expect(canSee(user, { organization: "ascent-pharma", ownerScope: "lab" })).toBe(false);
  });

  test("user can see personal scope", () => {
    const user = mock.user({ sub: "user-123", groups: [], adminScopes: [] });

    expect(canSee(user, inOrg("user-123"))).toBe(true);
  });

  test("group member can see matching scope", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/team-x"], adminScopes: [] });

    expect(canSee(user, inOrg("lab/team-x"))).toBe(true);
  });

  test("admin of parent scope can see descendant", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/admins"], adminScopes: ["lab"] });

    expect(canSee(user, inOrg("lab/team-x"))).toBe(true);
    expect(canSee(user, inOrg("lab/team-y"))).toBe(true);
    expect(canSee(user, inOrg("lab"))).toBe(true);
  });

  test("group member can see ancestor scopes", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/team-x"], adminScopes: [] });

    expect(canSee(user, inOrg("lab"))).toBe(true);
  });

  test("non-member and non-admin cannot see", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/team-x"], adminScopes: [] });

    expect(canSee(user, inOrg("rnd"))).toBe(false);
    expect(canSee(user, inOrg("lab/team-y"))).toBe(false);
  });

  test("scope prefix must match at boundary (no partial match)", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/admins"], adminScopes: ["lab"] });

    expect(canSee(user, inOrg("laboratory/team-x"))).toBe(false);
    expect(canSee(user, inOrg("lab/team-x"))).toBe(true);
  });

  test("resource from another organization is invisible even with matching scope", () => {
    const user = mock.user({
      sub: "user-1",
      organization: "vericura",
      groups: ["lab"],
      adminScopes: ["lab"],
    });

    expect(canSee(user, { organization: "ascent-pharma", ownerScope: "lab" })).toBe(false);
  });

  test("org-root-owned resources are visible to every active-org member", () => {
    const user = mock.user({
      sub: "user-1",
      organization: "org1",
      groups: ["lab"],
      adminScopes: [],
    });

    expect(canSee(user, inOrg("*"))).toBe(true);
  });

  test("org-root-owned resources are NOT visible to users from another org", () => {
    const user = mock.user({
      sub: "user-1",
      organization: "vericura",
      groups: ["lab"],
      adminScopes: [],
    });

    expect(canSee(user, { organization: "ascent-pharma", ownerScope: "*" })).toBe(false);
  });

  test("user without an active organization sees nothing", () => {
    const user = mock.user({
      sub: "user-1",
      organization: undefined,
      groups: ["lab"],
      adminScopes: ["lab"],
    });

    expect(canSee(user, inOrg("lab"))).toBe(false);
  });
});

describe("canModify", () => {
  test("org-root admin can modify any scope in the active org", () => {
    const user = mock.user({ sub: "admin-1", groups: [], adminScopes: ["*"] });

    expect(canModify(user, inOrg("lab/team-x"))).toBe(true);
  });

  test("user can modify personal scope", () => {
    const user = mock.user({ sub: "user-123", groups: [], adminScopes: [] });

    expect(canModify(user, inOrg("user-123"))).toBe(true);
  });

  test("admin of parent scope can modify descendant", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/admins"], adminScopes: ["lab"] });

    expect(canModify(user, inOrg("lab/team-x"))).toBe(true);
    expect(canModify(user, inOrg("lab"))).toBe(true);
  });

  test("group member (non-admin) CANNOT modify", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/team-x"], adminScopes: [] });

    expect(canModify(user, inOrg("lab/team-x"))).toBe(false);
  });

  test("rejects resources from another organization", () => {
    const user = mock.user({
      sub: "admin-1",
      organization: "vericura",
      adminScopes: ["lab"],
    });

    expect(canModify(user, { organization: "ascent-pharma", ownerScope: "lab" })).toBe(false);
  });

  test("non-admin org member cannot modify org-root-owned resources", () => {
    const user = mock.user({
      sub: "user-1",
      organization: "org1",
      groups: ["lab"],
      adminScopes: [],
    });

    expect(canModify(user, inOrg("*"))).toBe(false);
  });
});

describe("canCreate", () => {
  test("org-root admin can create in any scope in the active org", () => {
    const user = mock.user({ sub: "admin-1", groups: [], adminScopes: ["*"] });

    expect(canCreate(user, inOrg("lab/team-x"))).toBe(true);
    expect(canCreate(user, inOrg("anything"))).toBe(true);
  });

  test("personal scope is always allowed", () => {
    const user = mock.user({ sub: "user-123", groups: [], adminScopes: [] });

    expect(canCreate(user, inOrg("user-123"))).toBe(true);
  });

  test("admin can create in their admin scope and descendants", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/admins"], adminScopes: ["lab"] });

    expect(canCreate(user, inOrg("lab"))).toBe(true);
    expect(canCreate(user, inOrg("lab/team-x"))).toBe(true);
    expect(canCreate(user, inOrg("lab/team-x/sub-team"))).toBe(true);
  });

  test("admin scope boundary is respected (no partial match)", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/admins"], adminScopes: ["lab"] });

    expect(canCreate(user, inOrg("lab/team-x"))).toBe(true);
    expect(canCreate(user, inOrg("laboratory/team-x"))).toBe(false);
  });

  test("non-admin cannot create in group scope", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/team-x"], adminScopes: [] });

    expect(canCreate(user, inOrg("lab/team-x"))).toBe(false);
  });

  test("rejects resources from another organization", () => {
    const user = mock.user({
      sub: "admin-1",
      organization: "vericura",
      adminScopes: ["lab"],
    });

    expect(canCreate(user, { organization: "ascent-pharma", ownerScope: "lab" })).toBe(false);
  });
});

describe("filterVisible", () => {
  test("filters resources by visibility including ancestor scopes", () => {
    const user = mock.user({ sub: "user-1", groups: ["lab/team-x"], adminScopes: [] });

    const resources = [
      { organization: "org1", ownerScope: "user-1", id: 1 },
      { organization: "org1", ownerScope: "lab/team-x", id: 2 },
      { organization: "org1", ownerScope: "lab", id: 3 },
      { organization: "org1", ownerScope: "rnd", id: 4 },
      { organization: "org2", ownerScope: "lab", id: 5 },
    ];

    expect(filterVisible(user, resources)).toEqual([
      { organization: "org1", ownerScope: "user-1", id: 1 },
      { organization: "org1", ownerScope: "lab/team-x", id: 2 },
      { organization: "org1", ownerScope: "lab", id: 3 },
    ]);
  });

  test("returns empty array when no resources are visible", () => {
    const user = mock.user({ sub: "user-1", groups: [], adminScopes: [] });

    expect(filterVisible(user, [{ organization: "org1", ownerScope: "lab", id: 1 }])).toEqual([]);
  });
});
