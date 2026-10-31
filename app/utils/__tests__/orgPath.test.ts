import { describe, expect, test } from "vitest";

import {
  legacyRedirectPath,
  organizationFromPath,
  orgPath,
  stripOrgPath,
  switchOrgPath,
} from "../orgPath";

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
  test("keeps the current sub-path in the new organization", () => {
    expect(switchOrgPath("beta", "/acme/abc/folder")).toBe("/beta/abc/folder");
  });

  test("switches from the organization root to the new organization root", () => {
    expect(switchOrgPath("beta", "/acme")).toBe("/beta");
  });
});

describe("legacyRedirectPath", () => {
  test("sends the app root to the organization root", () => {
    expect(legacyRedirectPath("/", "acme")).toBe("/acme");
  });

  test("maps the legacy connection list to the organization root", () => {
    expect(legacyRedirectPath("/connections", "acme")).toBe("/acme");
  });

  test("maps a legacy connection object path without the connections segment", () => {
    expect(legacyRedirectPath("/connections/abc/a/b", "acme")).toBe("/acme/abc/a/b");
  });

  test("keeps the sub-path of a moved route", () => {
    expect(legacyRedirectPath("/admin/users", "acme")).toBe("/acme/admin/users");
    expect(legacyRedirectPath("/plugin/jobs", "acme")).toBe("/acme/plugin/jobs");
  });

  test("matches a moved route whose name is a prefix of another path", () => {
    expect(legacyRedirectPath("/recent", "acme")).toBe("/acme/recent");
    expect(legacyRedirectPath("/recently", "acme")).toBeUndefined();
  });

  test("leaves unrelated and already-prefixed paths alone", () => {
    expect(legacyRedirectPath("/nonsense", "acme")).toBeUndefined();
    expect(legacyRedirectPath("/acme/recent", "acme")).toBeUndefined();
    expect(legacyRedirectPath("/api/broker", "acme")).toBeUndefined();
  });

  test("cannot redirect without an organization", () => {
    expect(legacyRedirectPath("/recent", undefined)).toBeUndefined();
  });
});
