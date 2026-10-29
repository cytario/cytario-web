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
    expect(orgPath("acme", "/connections/abc/folder")).toBe("/o/acme/connections/abc/folder");
  });

  test("accepts a path without a leading slash", () => {
    expect(orgPath("acme", "recent")).toBe("/o/acme/recent");
  });

  test("maps the app root to the organization root", () => {
    expect(orgPath("acme", "/")).toBe("/o/acme");
  });

  test("returns the path untouched without an organization", () => {
    expect(orgPath(undefined, "/connections")).toBe("/connections");
  });

  test("encodes aliases that are not path-safe", () => {
    expect(orgPath("team alpha", "/recent")).toBe("/o/team%20alpha/recent");
  });

  test("leaves an absolute URL alone", () => {
    expect(orgPath("acme", "https://admin.example.com/portal")).toBe(
      "https://admin.example.com/portal",
    );
    expect(orgPath("acme", "//cdn.example.com/x")).toBe("//cdn.example.com/x");
  });
});

describe("organizationFromPath", () => {
  test("reads the alias out of a prefixed path", () => {
    expect(organizationFromPath("/o/acme/connections/abc")).toBe("acme");
  });

  test("decodes an encoded alias", () => {
    expect(organizationFromPath("/o/team%20alpha/recent")).toBe("team alpha");
  });

  test("is undefined outside the prefix", () => {
    expect(organizationFromPath("/connections")).toBeUndefined();
    expect(organizationFromPath("/o")).toBeUndefined();
    expect(organizationFromPath("/")).toBeUndefined();
  });
});

describe("stripOrgPath", () => {
  test("drops the prefix", () => {
    expect(stripOrgPath("/o/acme/connections/abc")).toBe("/connections/abc");
  });

  test("maps the organization root to the app root", () => {
    expect(stripOrgPath("/o/acme")).toBe("/");
    expect(stripOrgPath("/o/acme/")).toBe("/");
  });

  test("leaves an un-prefixed path alone", () => {
    expect(stripOrgPath("/connections")).toBe("/connections");
  });
});

describe("switchOrgPath", () => {
  test("keeps the current sub-path in the new organization", () => {
    expect(switchOrgPath("beta", "/o/acme/connections/abc/folder")).toBe(
      "/o/beta/connections/abc/folder",
    );
  });

  test("switches from the organization root to the new organization root", () => {
    expect(switchOrgPath("beta", "/o/acme")).toBe("/o/beta");
  });
});

describe("legacyRedirectPath", () => {
  test("sends the app root to the organization root", () => {
    expect(legacyRedirectPath("/", "acme")).toBe("/o/acme");
  });

  test("keeps the sub-path of a moved route", () => {
    expect(legacyRedirectPath("/connections/abc/a/b", "acme")).toBe("/o/acme/connections/abc/a/b");
    expect(legacyRedirectPath("/admin/users", "acme")).toBe("/o/acme/admin/users");
    expect(legacyRedirectPath("/plugin/jobs", "acme")).toBe("/o/acme/plugin/jobs");
  });

  test("matches a moved route whose name is a prefix of another path", () => {
    expect(legacyRedirectPath("/recent", "acme")).toBe("/o/acme/recent");
    expect(legacyRedirectPath("/recently", "acme")).toBeUndefined();
  });

  test("leaves unrelated and already-prefixed paths alone", () => {
    expect(legacyRedirectPath("/nonsense", "acme")).toBeUndefined();
    expect(legacyRedirectPath("/o/acme/connections", "acme")).toBeUndefined();
    expect(legacyRedirectPath("/api/broker", "acme")).toBeUndefined();
  });

  test("sends a bare /o to the organization root", () => {
    expect(legacyRedirectPath("/o", "acme")).toBe("/o/acme");
  });

  test("cannot redirect without an organization", () => {
    expect(legacyRedirectPath("/connections", undefined)).toBeUndefined();
  });
});
