import { afterEach, describe, expect, test, vi } from "vitest";

import {
  hostRequestDataFromJobToken,
  orgAgnosticHostRequestData,
  readOrganizationClaimKeys,
  readSoleOrganizationClaim,
} from "~/.server/auth/carveOutRequestContext";
import type { VerifiedJobToken } from "~/.server/auth/verifyJobToken";

const tokenWithClaim = (organization: unknown): VerifiedJobToken =>
  ({ sub: "submitting-user-42", organization }) as VerifiedJobToken;

describe("readOrganizationClaimKeys", () => {
  test("returns every key of the object claim", () => {
    const payload = tokenWithClaim({
      "cosmo-bio": { id: "org-1", groups: [] },
      cytario: { id: "org-2", groups: [] },
    });
    expect(new Set(readOrganizationClaimKeys(payload))).toEqual(new Set(["cosmo-bio", "cytario"]));
  });

  test("returns the single key of a single-org object claim", () => {
    const payload = tokenWithClaim({ testcorp: { id: "org-1", groups: [] } });
    expect([...readOrganizationClaimKeys(payload)]).toEqual(["testcorp"]);
  });

  test("accepts a string claim as a single-entry set with a warn log", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = tokenWithClaim("testcorp");
    expect([...readOrganizationClaimKeys(payload)]).toEqual(["testcorp"]);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  test("returns an empty set when the claim is absent", () => {
    expect(readOrganizationClaimKeys({ sub: "user-1" }).size).toBe(0);
    expect(readOrganizationClaimKeys({ sub: "user-1", organization: undefined }).size).toBe(0);
  });

  test("returns an empty set for a claim of unexpected shape", () => {
    expect(readOrganizationClaimKeys(tokenWithClaim(42)).size).toBe(0);
    expect(readOrganizationClaimKeys(tokenWithClaim(["testcorp"])).size).toBe(0);
  });
});

describe("readSoleOrganizationClaim", () => {
  test("returns the sole key of a single-org claim", () => {
    expect(readSoleOrganizationClaim(tokenWithClaim({ testcorp: { groups: [] } }))).toBe(
      "testcorp",
    );
  });

  test("returns the string claim value", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readSoleOrganizationClaim(tokenWithClaim("testcorp"))).toBe("testcorp");
    warnSpy.mockRestore();
  });

  test("returns undefined for a multi-org claim", () => {
    const payload = tokenWithClaim({
      "cosmo-bio": { groups: [] },
      cytario: { groups: [] },
    });
    expect(readSoleOrganizationClaim(payload)).toBeUndefined();
  });

  test("returns undefined when the claim is absent", () => {
    expect(readSoleOrganizationClaim({ sub: "user-1" })).toBeUndefined();
  });
});

describe("hostRequestDataFromJobToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const token = tokenWithClaim({
    "cosmo-bio": { groups: [] },
    cytario: { groups: [] },
  });

  test("carries the explicit organization into the user profile and identity", () => {
    const data = hostRequestDataFromJobToken(token, "raw-token", "cosmo-bio");
    expect(data.user.sub).toBe("submitting-user-42");
    expect(data.user.organization).toBe("cosmo-bio");
    expect(data.identity?.organization).toBe("cosmo-bio");
    expect(data.identity?.sub).toBe("submitting-user-42");
  });

  test("leaves the organization undefined when the caller cannot resolve one", () => {
    const data = hostRequestDataFromJobToken(token, "raw-token", undefined);
    expect(data.user.organization).toBeUndefined();
    expect(data.identity?.organization).toBeUndefined();
    // The failing-closed mirror of orgAgnosticHostRequestData: no org, but
    // the submitting user is still identified from the token.
    expect(data.user.sub).toBe("submitting-user-42");
    expect(data.identity?.sub).toBe("submitting-user-42");
  });

  test("carries the raw token as both access and id token for STS", () => {
    const data = hostRequestDataFromJobToken(token, "raw-token", "cytario");
    expect(data.authTokens.accessToken).toBe("raw-token");
    expect(data.authTokens.idToken).toBe("raw-token");
    expect(data.authTokens.refreshToken).toBe("");
    expect(data.sessionId).toBe("job-token:submitting-user-42");
  });
});

describe("orgAgnosticHostRequestData", () => {
  test("has no organization and no identity", () => {
    const data = orgAgnosticHostRequestData();
    expect(data.user.organization).toBeUndefined();
    expect(data.user.sub).toBe("");
    expect(data.identity).toBeUndefined();
    expect(data.sessionId).toBe("carve-out:org-agnostic");
  });
});
