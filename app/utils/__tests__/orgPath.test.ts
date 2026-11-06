import { describe, expect, test } from "vitest";

import { organizationFromPath, orgPath, stripOrgPath, switchOrgPath } from "../orgPath";

describe("orgPath", () => {
  test("prefixes an app path with the organization", () => {
    expect(orgPath("acme", "/abc/folder")).toBe("/acme/abc/folder");
  });

  test("accepts a path without a leading slash", () => {
    expect(orgPath("acme", "recent")).toBe("/acme/recent");
  });

  test("maps the app root to the organization root", () => {
    expect(orgPath("acme", "/")).toBe("/acme");
  });

  test("returns the path untouched without an organization", () => {
    expect(orgPath(undefined, "/recent")).toBe("/recent");
  });

  test("encodes aliases that are not path-safe", () => {
    expect(orgPath("team alpha", "/recent")).toBe("/team%20alpha/recent");
  });

  test("leaves an absolute URL alone", () => {
    expect(orgPath("acme", "https://admin.example.com/portal")).toBe(
      "https://admin.example.com/portal",
    );
    expect(orgPath("acme", "//cdn.example.com/x")).toBe("//cdn.example.com/x");
  });
});

describe("organizationFromPath", () => {
  test("reads the alias out of the first segment", () => {
    expect(organizationFromPath("/acme/abc")).toBe("acme");
  });

  test("decodes an encoded alias", () => {
    expect(organizationFromPath("/team%20alpha/recent")).toBe("team alpha");
  });

  test("is undefined on reserved top-level routes", () => {
    // The platform's own routes can never be an organization.
    expect(organizationFromPath("/login")).toBeUndefined();
    expect(organizationFromPath("/api/broker")).toBeUndefined();
    expect(organizationFromPath("/recent")).toBeUndefined();
    expect(organizationFromPath("/")).toBeUndefined();
  });
});

describe("stripOrgPath", () => {
  test("drops the prefix", () => {
    expect(stripOrgPath("/acme/abc")).toBe("/abc");
  });

  test("maps the organization root to the app root", () => {
    expect(stripOrgPath("/acme")).toBe("/");
    expect(stripOrgPath("/acme/")).toBe("/");
  });

  test("leaves a reserved top-level path alone", () => {
    expect(stripOrgPath("/login")).toBe("/login");
  });
});

describe("switchOrgPath", () => {
  test("targets the new organization's root (its connection list)", () => {
    // The current sub-path is deliberately not kept: a connection id or
    // object path belongs to the tenant it lives in — the same path in
    // another organization is always a 404.
    expect(switchOrgPath("beta")).toBe("/beta");
  });
});

describe("un-prefixed legacy app paths", () => {
  test("are not organizations and resolve no org from the path", () => {
    // The redirect layer is gone; legacy paths fall through to the 404
    // fallback. organizationFromPath still treats their first segment as a
    // potential org (reserved roots excluded), which is what the fallback
    // uses to decide whether a bare path could ever have been valid.
    expect(organizationFromPath("/connections")).toBeUndefined();
    expect(organizationFromPath("/recent")).toBeUndefined();
    expect(organizationFromPath("/api/broker")).toBeUndefined();
  });
});

describe("single-fetch revalidation URLs", () => {
  test("a client-side navigation's .data suffix never pollutes the org alias", () => {
    // RR single fetch: navigating to /second revalidates against /second.data,
    // to /second/ against /second/_.data. The org must read as `second` —
    // the root loader's user projection depends on it (a wrong alias serves
    // the org-neutral profile: empty groups/scopes for the whole shell).
    expect(organizationFromPath("/second.data")).toBe("second");
    expect(organizationFromPath("/second/_.data")).toBe("second");
    expect(organizationFromPath("/second/recent.data")).toBe("second");
    expect(stripOrgPath("/second.data")).toBe("/");
    expect(stripOrgPath("/second/recent.data")).toBe("/recent");
  });

  test("a document path is untouched by the suffix strip", () => {
    expect(organizationFromPath("/second")).toBe("second");
    expect(organizationFromPath("/second/")).toBe("second");
    expect(organizationFromPath("/recent")).toBeUndefined();
  });
});
