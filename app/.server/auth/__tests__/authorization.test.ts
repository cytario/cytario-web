import { canCreate, canModify, canSee, filterVisible } from "../authorization";
import mock from "~/utils/__tests__/__mocks__";

describe("canSee", () => {
  test("realm admin can see everything", () => {
    const user = mock.user({
      sub: "admin-1",
      groups: ["cytario/admins"],
      adminScopes: ["cytario"],
      isRealmAdmin: true,
    });

    expect(canSee(user, "org1/lab/team-x")).toBe(true);
    expect(canSee(user, "anything")).toBe(true);
  });

  test("user can see personal scope", () => {
    const user = mock.user({
      sub: "user-123",
      groups: [],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canSee(user, "user-123")).toBe(true);
  });

  test("group member can see matching scope", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canSee(user, "org1/lab/team-x")).toBe(true);
  });

  test("admin of parent scope can see descendant", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/admins"],
      adminScopes: ["org1/lab"],
      isRealmAdmin: false,
    });

    expect(canSee(user, "org1/lab/team-x")).toBe(true);
    expect(canSee(user, "org1/lab/team-y")).toBe(true);
    expect(canSee(user, "org1/lab")).toBe(true);
  });

  test("admin of ancestor scope can see deeply nested descendant", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/admins"],
      adminScopes: ["org1"],
      isRealmAdmin: false,
    });

    expect(canSee(user, "org1/lab/team-x/sub-team")).toBe(true);
  });

  test("group member can see ancestor scopes", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canSee(user, "org1/lab")).toBe(true);
    expect(canSee(user, "org1")).toBe(true);
  });

  test("deeply nested group member sees all ancestors", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x/sub-team"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canSee(user, "org1/lab/team-x")).toBe(true);
    expect(canSee(user, "org1/lab")).toBe(true);
    expect(canSee(user, "org1")).toBe(true);
  });

  test("non-member and non-admin cannot see", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canSee(user, "org2/lab")).toBe(false);
    expect(canSee(user, "org1/lab/team-y")).toBe(false);
  });

  test("scope prefix must match at boundary (no partial match)", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/admins"],
      adminScopes: ["org1"],
      isRealmAdmin: false,
    });

    // "org1" is admin scope, "org10" should NOT match
    expect(canSee(user, "org10/lab")).toBe(false);
    // But "org1/anything" should match
    expect(canSee(user, "org1/lab")).toBe(true);
  });
});

describe("canModify", () => {
  test("realm admin can modify anything", () => {
    const user = mock.user({
      sub: "admin-1",
      groups: ["cytario/admins"],
      adminScopes: ["cytario"],
      isRealmAdmin: true,
    });

    expect(canModify(user, "org1/lab/team-x")).toBe(true);
  });

  test("user can modify personal scope", () => {
    const user = mock.user({
      sub: "user-123",
      groups: [],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canModify(user, "user-123")).toBe(true);
  });

  test("admin of parent scope can modify descendant", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/admins"],
      adminScopes: ["org1/lab"],
      isRealmAdmin: false,
    });

    expect(canModify(user, "org1/lab/team-x")).toBe(true);
    expect(canModify(user, "org1/lab")).toBe(true);
  });

  test("group member (non-admin) CANNOT modify", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canModify(user, "org1/lab/team-x")).toBe(false);
  });

  test("non-member cannot modify", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canModify(user, "org2/lab")).toBe(false);
  });
});

describe("canCreate", () => {
  test("personal scope is always allowed", () => {
    const user = mock.user({
      sub: "user-123",
      groups: [],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canCreate(user, "user-123")).toBe(true);
  });

  test("admin can create in their admin scope", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/admins"],
      adminScopes: ["org1/lab"],
      isRealmAdmin: false,
    });

    expect(canCreate(user, "org1/lab")).toBe(true);
  });

  test("admin can create in descendant scope", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/admins"],
      adminScopes: ["org1/lab"],
      isRealmAdmin: false,
    });

    expect(canCreate(user, "org1/lab/team-x")).toBe(true);
    expect(canCreate(user, "org1/lab/team-x/sub-team")).toBe(true);
  });

  test("admin scope boundary is respected (no partial match)", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/admins"],
      adminScopes: ["org1"],
      isRealmAdmin: false,
    });

    expect(canCreate(user, "org1/lab")).toBe(true);
    expect(canCreate(user, "org10/lab")).toBe(false);
  });

  test("realm admin can create anywhere", () => {
    const user = mock.user({
      sub: "admin-1",
      groups: ["cytario/admins"],
      adminScopes: ["cytario"],
      isRealmAdmin: true,
    });

    expect(canCreate(user, "org1/lab/team-x")).toBe(true);
    expect(canCreate(user, "anything")).toBe(true);
  });

  test("non-admin cannot create in group scope", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    expect(canCreate(user, "org1/lab/team-x")).toBe(false);
  });
});

describe("filterVisible", () => {
  test("filters resources by visibility including ancestor scopes", () => {
    const user = mock.user({
      sub: "user-1",
      groups: ["org1/lab/team-x"],
      adminScopes: [],
      isRealmAdmin: false,
    });

    const resources = [
      { ownerScope: "user-1", id: 1 },
      { ownerScope: "org1/lab/team-x", id: 2 },
      { ownerScope: "org1/lab", id: 3 },
      { ownerScope: "org1", id: 4 },
      { ownerScope: "org2/lab", id: 5 },
    ];

    const visible = filterVisible(user, resources);

    expect(visible).toEqual([
      { ownerScope: "user-1", id: 1 },
      { ownerScope: "org1/lab/team-x", id: 2 },
      { ownerScope: "org1/lab", id: 3 },
      { ownerScope: "org1", id: 4 },
    ]);
  });

  test("realm admin sees all resources", () => {
    const user = mock.user({
      sub: "admin-1",
      groups: ["cytario/admins"],
      adminScopes: ["cytario"],
      isRealmAdmin: true,
    });

    const resources = [
      { ownerScope: "org1/lab", id: 1 },
      { ownerScope: "org2", id: 2 },
    ];

    expect(filterVisible(user, resources)).toEqual(resources);
  });

  test("returns empty array when no resources are visible", () => {
    const user = mock.user({
      sub: "user-1",
      groups: [],
      adminScopes: [],
      isRealmAdmin: false,
    });

    const resources = [{ ownerScope: "org1/lab", id: 1 }];

    expect(filterVisible(user, resources)).toEqual([]);
  });
});
