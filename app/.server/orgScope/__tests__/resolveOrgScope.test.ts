import { describe, expect, test } from "vitest";

import { resolveOrgScope } from "../resolveOrgScope";

const base = {
  organizations: ["acme", "beta"],
  pathname: "/o/acme/connections/abc",
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

  test("a non-membership org redirects to the active org, keeping the sub-path", () => {
    expect(
      resolveOrgScope({
        urlOrganization: "other",
        activeOrganization: "acme",
        organizations: ["acme", "beta"],
        pathname: "/o/other/connections/abc/a",
        search: "?modal=add-connection",
      }),
    ).toEqual({
      kind: "redirect",
      to: "/o/acme/connections/abc/a?modal=add-connection",
    });
  });

  test("a non-membership org falls back to the first membership without an active org", () => {
    expect(
      resolveOrgScope({ ...base, urlOrganization: "other", pathname: "/o/other/recent" }),
    ).toEqual({ kind: "redirect", to: "/o/acme/recent" });
  });

  test("a non-membership org with no memberships sends the user to onboarding", () => {
    expect(
      resolveOrgScope({
        organizations: [],
        pathname: "/o/other/recent",
        urlOrganization: "other",
      }),
    ).toEqual({ kind: "redirect", to: "/onboarding" });
  });

  test("a mutation cannot switch tenant — it redirects instead of replaying its body", () => {
    expect(
      resolveOrgScope({
        ...base,
        urlOrganization: "beta",
        activeOrganization: "acme",
        canSwitch: false,
      }),
    ).toEqual({ kind: "redirect", to: "/o/acme/connections/abc" });
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
