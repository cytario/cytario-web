import { describe, expect, test } from "vitest";

import { scopeGroupsOf } from "../keycloakAdmin";
import { type GroupWithMembers } from "../keycloakAdmin/orgGroups";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

function group(path: string, subGroups: GroupWithMembers[] = []): GroupWithMembers {
  return {
    id: `id-${path}`,
    name: path.split("/").pop() ?? path,
    path,
    members: [],
    subGroups,
  };
}

describe("scopeGroupsOf", () => {
  test("flattens a scope group with its subgroups, sorted by path", () => {
    const lab = group("lab", [group("lab/team-b"), group("lab/team-a")]);

    expect(scopeGroupsOf(lab, "lab").map((g) => g.path)).toEqual([
      "lab",
      "lab/team-a",
      "lab/team-b",
    ]);
  });

  test("excludes the synthesised org-root node for the org root scope", () => {
    const root = group("acme", [group("lab"), group("customers", [group("customers/vericura")])]);

    expect(scopeGroupsOf(root, ORG_ROOT_SCOPE).map((g) => g.path)).toEqual([
      "customers",
      "customers/vericura",
      "lab",
    ]);
  });

  test("returns no groups when the scope group is missing", () => {
    expect(scopeGroupsOf(undefined, "lab")).toEqual([]);
    expect(scopeGroupsOf(undefined, ORG_ROOT_SCOPE)).toEqual([]);
  });
});
