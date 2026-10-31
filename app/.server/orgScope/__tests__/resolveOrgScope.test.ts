import { describe, expect, test } from "vitest";

import { resolveOrgScope } from "../resolveOrgScope";

const base = {
  organizations: ["acme", "beta"],
  pathname: "/acme/abc",
};

describe("resolveOrgScope", () => {
  test("continues when the URL org is the session org", () => {
    expect(
      resolveOrgScope({ ...base, urlOrganization: "acme", activeOrganization: "acme" }),
    ).toEqual({ kind: "active" });
  });

  test("continues outside the organization prefix (auth and API routes)", () => {
    expect(resolveOrgScope({ ...base, activeOrganization: "acme" })).toEqual({ kind: "active" });
  });

  test("switches when the URL names another membership", () => {
    expect(
      resolveOrgScope({
        ...base,
        urlOrganization: "beta",
        activeOrganization: "acme",
      }),
    ).toEqual({ kind: "switch", organization: "beta" });
  });

  test("switches when the session has no active org yet", () => {
    expect(resolveOrgScope({ ...base, urlOrganization: "beta" })).toEqual({
      kind: "switch",
      organization: "beta",
    });
  });

  test("a non-membership org on an org-agnostic route keeps the sub-path", () => {
    expect(
      resolveOrgScope({
        urlOrganization: "other",
        activeOrganization: "acme",
        organizations: ["acme", "beta"],
        pathname: "/other/recent",
        search: "?x=1",
      }),
    ).toEqual({ kind: "redirect", to: "/acme/recent?x=1" });
  });

  test("a non-membership org on a connection path lands on the active org's root", () => {
    // The connection id belongs to the foreign tenant — the same path in the
    // active org is a 404, so the redirect drops it.
    expect(
      resolveOrgScope({
        urlOrganization: "other",
        activeOrganization: "acme",
        organizations: ["acme", "beta"],
        pathname: "/other/00000000-0000-4000-8000-000000000000/folder",
      }),
    ).toEqual({ kind: "redirect", to: "/acme" });
  });

  test("a non-membership org falls back to the first membership without an active org", () => {
    expect(
      resolveOrgScope({ ...base, urlOrganization: "other", pathname: "/other/recent" }),
    ).toEqual({ kind: "redirect", to: "/acme/recent" });
  });

  test("a non-membership org with no memberships sends the user to onboarding", () => {
    expect(
      resolveOrgScope({
        organizations: [],
        pathname: "/other/recent",
        urlOrganization: "other",
      }),
    ).toEqual({ kind: "redirect", to: "/onboarding" });
  });

  test("a mutation cannot switch tenant — it redirects to the active org's root instead of replaying its body", () => {
    expect(
      resolveOrgScope({
        ...base,
        urlOrganization: "beta",
        activeOrganization: "acme",
        canSwitch: false,
      }),
    ).toEqual({ kind: "redirect", to: "/acme" });
  });

  test("a mutation in the active org proceeds", () => {
    expect(
      resolveOrgScope({
        ...base,
        urlOrganization: "acme",
        activeOrganization: "acme",
        canSwitch: false,
      }),
    ).toEqual({ kind: "active" });
  });
});
