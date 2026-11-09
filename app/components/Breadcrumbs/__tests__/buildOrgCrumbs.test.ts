import { describe, expect, test } from "vitest";

import { buildOrgCrumbs } from "../breadcrumbTrail";

describe("buildOrgCrumbs", () => {
  test("lists the active organization first", () => {
    expect(buildOrgCrumbs(["acme", "beta"], "beta")).toEqual([
      { alias: "beta", isActive: true },
      { alias: "acme", isActive: false },
    ]);
  });

  test("does not repeat the active organization", () => {
    expect(buildOrgCrumbs(["acme", "beta"], "acme")).toEqual([
      { alias: "acme", isActive: true },
      { alias: "beta", isActive: false },
    ]);
  });

  test("includes an active organization the token list omits", () => {
    expect(buildOrgCrumbs([], "acme")).toEqual([{ alias: "acme", isActive: true }]);
  });

  test("is empty without memberships or an active organization", () => {
    expect(buildOrgCrumbs([], undefined)).toEqual([]);
  });
});
