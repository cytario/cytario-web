import { describe, expect } from "vitest";

import { getCrumbs } from "../getCrumbs";

describe("getCrumbs", () => {
  test("returns the correct breadcrumb data objects", () => {
    const segments = ["home", "documents", "reports"];
    const to = "/base";
    const crumbs = getCrumbs(to, segments);

    expect(crumbs).toHaveLength(3);
    expect(crumbs[0].to).toEqual("/base/home");
    expect(crumbs[1].to).toEqual("/base/home/documents");
    expect(crumbs[2].to).toEqual("/base/home/documents/reports");

    expect(crumbs[0].label).toEqual("home");
    expect(crumbs[1].label).toEqual("documents");
    expect(crumbs[2].label).toEqual("reports");

    expect(crumbs[2].isActive).toBe(true);
    expect(crumbs[0].isActive).toBe(false);
  });
});
