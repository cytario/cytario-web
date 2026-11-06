import {
  profileFromAccessToken,
  resolveActiveOrganization,
  toIdentity,
  type UserProfile,
} from "../getUserInfo";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";

vi.mock("../wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

/** An unsigned JWT carrying `claims` — profileFromAccessToken decodes, never verifies. */
const forgeToken = (claims: Record<string, unknown>): string => {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.`;
};

/** The claims payload each test built for the (removed) userinfo fetch.
 * Asserts non-null so test bodies keep the old getUserInfo ergonomics. */
const profileFromRaw = (raw: Record<string, unknown>) => {
  const profile = profileFromAccessToken(forgeToken(raw));
  if (!profile) throw new Error(`test payload produced no profile: ${JSON.stringify(raw)}`);
  return profile;
};

describe("getUserInfo", () => {
  const mockUserinfoEndpoint = "https://auth.example.com/userinfo";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      token_endpoint: "https://auth.example.com/token",
      authorization_endpoint: "https://auth.example.com/auth",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: mockUserinfoEndpoint,
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
    });
  });

  describe("Success Cases", () => {
    test("returns user profile on successful fetch", async () => {
      const rawProfile = {
        sub: "user-uuid-123",
        email: "user@example.com",
        email_verified: true,
        name: "Test User",
        preferred_username: "string",
        given_name: "string",
        family_name: "string",
        policy: ["default-policy"],
        groups: ["/org1/lab", "/org1/lab/admins"],
        organization: {
          org1: { groups: ["/org1/lab", "/org1/lab/admins"] },
        },
      };

      const result = await profileFromRaw(rawProfile);

      expect(result).toEqual(
        expect.objectContaining({
          sub: "user-uuid-123",
          email: "user@example.com",
          // Memberships only — the profile type has no entitlement fields.
        }),
      );
    });

    const rawProfile = (overrides?: Record<string, unknown>) => ({
      sub: "uuid-default",
      email: "user@example.com",
      email_verified: true,
      name: "Default",
      preferred_username: "default",
      given_name: "Default",
      family_name: "User",
      policy: [],
      groups: [],
      ...overrides,
    });

    test("derives the profile without any network fetch", async () => {
      const result = profileFromRaw(rawProfile());

      expect(result).toEqual(expect.objectContaining({ sub: "uuid-default" }));
      // The userinfo round-trip is gone: login derives from the ID token.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("an empty-claims token yields the schema defaults", () => {
      // A token whose claims parse to the schema's minimum: no userinfo to
      // fall back on — the defaults are the contract.
      const result = profileFromRaw({ sub: "only-sub" });
      expect(result?.sub).toBe("only-sub");
      expect(result?.organizations).toEqual({});
    });

    test("returns all user profile fields", async () => {
      const fullProfile = rawProfile({
        sub: "uuid-456",
        email_verified: true,
        name: "Full Name",
        preferred_username: "fullname",
        given_name: "Full",
        family_name: "Name",
        email: "full@example.com",
        policy: ["default-policy"],
        organization: { testcorp: { groups: ["/admin", "/users"] } },
      });

      const result = await profileFromRaw(fullProfile);

      expect(result.sub).toBe("uuid-456");
      expect(result.email_verified).toBe(true);
      expect(result.name).toBe("Full Name");
      expect(result.preferred_username).toBe("fullname");
      expect(result.given_name).toBe("Full");
      expect(result.family_name).toBe("Name");
      expect(result.email).toBe("full@example.com");
      expect(result.policy).toEqual(["default-policy"]);
      // Memberships only — no projected fields exist on the profile.
      expect(result.organizations.testcorp.groups).toEqual(["admin", "users"]);
    });
  });

  describe("Organization Claim", () => {
    test("captures every membership alias with its nested groups", async () => {
      const rawProfile = {
        sub: "user-uuid-123",
        email: "user@vericura.com",
        email_verified: true,
        name: "Alice",
        preferred_username: "alice",
        given_name: "Alice",
        family_name: "Doe",
        policy: [],
        groups: [],
        organization: {
          vericura: { groups: ["/lab", "/customers/ascent-pharma"] },
        },
      };

      const result = await profileFromRaw(rawProfile);

      expect(Object.keys(result.organizations)).toEqual(["vericura"]);
      expect(result.organizations.vericura.groups).toEqual(["lab", "customers/ascent-pharma"]);
    });

    test("root /admins stays nested — the projection is request-local", async () => {
      const rawProfile = {
        sub: "user-uuid-456",
        email: "admin@cytar.io",
        email_verified: true,
        name: "Admin",
        preferred_username: "admin",
        given_name: "Admin",
        family_name: "User",
        policy: [],
        groups: [],
        organization: {
          cytario: { groups: ["/admins"] },
        },
      };

      const result = await profileFromRaw(rawProfile);

      expect(result.organizations.cytario.groups).toEqual(["admins"]);
    });

    test("nested admin groups stay nested — orgEntitlements derives them", async () => {
      const rawProfile = {
        sub: "user-uuid-789",
        email: "owner@vericura.com",
        email_verified: true,
        name: "Owner",
        preferred_username: "owner",
        given_name: "Owner",
        family_name: "User",
        policy: [],
        groups: [],
        organization: {
          vericura: { groups: ["/admins", "/customers/ascent-pharma/admins"] },
        },
      };

      const result = await profileFromRaw(rawProfile);

      expect(result.organizations.vericura.groups).toEqual([
        "admins",
        "customers/ascent-pharma/admins",
      ]);
    });

    test("returns an empty membership map when claim is absent", async () => {
      const rawProfile = {
        sub: "user-uuid-000",
        email: "new@example.com",
        email_verified: true,
        name: "New",
        preferred_username: "new",
        given_name: "New",
        family_name: "User",
        policy: [],
        groups: [],
      };

      const result = await profileFromRaw(rawProfile);

      expect(result.organizations).toEqual({});
    });

    test("captures org attributes (excluding id/groups), preserving the multivalued array shape", async () => {
      const rawProfile = {
        sub: "user-uuid-attrs",
        email: "attrs@example.com",
        email_verified: true,
        name: "Attrs",
        preferred_username: "attrs",
        given_name: "Attrs",
        family_name: "User",
        policy: [],
        groups: [],
        organization: {
          testcorp: {
            id: "42c3-id",
            groups: ["/lab"],
            subscription_status: ["active"],
            subscription_period_end: ["2026-12-31", "ignored"],
          },
        },
      };

      const result = await profileFromRaw(rawProfile);

      // Multivalued attrs keep all their values — the host does not collapse.
      expect(result.organizations.testcorp.attributes).toEqual({
        subscription_status: ["active"],
        subscription_period_end: ["2026-12-31", "ignored"],
      });
      // Host-owned keys never leak into the opaque attribute map.
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("id");
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("groups");
    });

    test("passes through seat-plan org attributes unchanged", async () => {
      const rawProfile = {
        sub: "user-uuid-seats",
        email: "seats@example.com",
        email_verified: true,
        name: "Seats",
        preferred_username: "seats",
        given_name: "Seats",
        family_name: "User",
        policy: [],
        groups: [],
        organization: {
          testcorp: {
            id: "42c3-id",
            groups: ["/lab"],
            viewing_seats: ["10"],
            analysis_seats: ["3"],
            analyst_group: ["analysts"],
          },
        },
      };

      const result = await profileFromRaw(rawProfile);

      expect(result.organizations.testcorp.attributes).toEqual({
        viewing_seats: ["10"],
        analysis_seats: ["3"],
        analyst_group: ["analysts"],
      });
    });

    test("drops email-shaped and oversized attribute values (host-side hygiene)", async () => {
      const rawProfile = {
        sub: "user-uuid-hygiene",
        email: "hygiene@example.com",
        email_verified: true,
        name: "Hygiene",
        preferred_username: "hygiene",
        given_name: "Hygiene",
        family_name: "User",
        policy: [],
        groups: [],
        organization: {
          testcorp: {
            id: "id",
            groups: [],
            subscription_status: ["active"],
            // Defence-in-depth: a future mapper change leaking PII must not
            // reach the client bundle.
            billing_email: ["someone@example.com"],
            oversized: ["x".repeat(257)],
          },
        },
      };

      const result = await profileFromRaw(rawProfile);

      expect(result.organizations.testcorp.attributes).toEqual({
        subscription_status: ["active"],
      });
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("billing_email");
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("oversized");
    });

    test("freezes the membership entries so a consumer cannot mutate them", async () => {
      const rawProfile = {
        sub: "user-uuid-frozen",
        email: "frozen@example.com",
        email_verified: true,
        name: "Frozen",
        preferred_username: "frozen",
        given_name: "Frozen",
        family_name: "User",
        policy: [],
        groups: [],
        organization: { testcorp: { id: "id", groups: [], subscription_status: ["active"] } },
      };

      const result = profileFromRaw(rawProfile);

      expect(Object.isFrozen(result.organizations.testcorp)).toBe(true);
      expect(Object.isFrozen(result.organizations.testcorp.attributes)).toBe(true);
    });

    test("tolerates scalar, array, and id-shape variants without throwing", async () => {
      const rawProfile = {
        sub: "user-uuid-shapes",
        email: "shapes@example.com",
        email_verified: true,
        name: "Shapes",
        preferred_username: "shapes",
        given_name: "Shapes",
        family_name: "User",
        policy: [],
        groups: [],
        organization: {
          testcorp: {
            // `id` can surface array-shaped depending on mapper config.
            id: ["42c3-id"],
            groups: ["/lab"],
            // Single-valued attr emitted as a bare scalar.
            subscription_status: "active",
            // Multivalued attr collapses to its first element.
            plan: ["pro", "ignored"],
            // Empty array yields no value → dropped.
            empty_attr: [],
            // Non-string element → dropped.
            numeric_attr: [42],
          },
        },
      };

      const result = await profileFromRaw(rawProfile);

      // Scalar is wrapped to a one-element array; a multivalued attr keeps all
      // its (string) values; empty and non-string-only attrs are dropped.
      expect(result.organizations.testcorp.attributes).toEqual({
        subscription_status: ["active"],
        plan: ["pro", "ignored"],
      });
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("id");
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("empty_attr");
      expect(result.organizations.testcorp.attributes).not.toHaveProperty("numeric_attr");
      // The array-shaped id resolves to its first usable value.
      expect(result.organizations.testcorp.id).toBe("42c3-id");
    });

    test("defaults org attributes to empty object when claim is absent", async () => {
      const rawProfile = {
        sub: "user-uuid-noorg",
        email: "noorg@example.com",
        email_verified: true,
        name: "No Org",
        preferred_username: "noorg",
        given_name: "No",
        family_name: "Org",
        policy: [],
        groups: [],
      };

      const result = await profileFromRaw(rawProfile);

      expect(result.organizations).toEqual({});
    });

    test("the stored profile is org-neutral — nested organization groups never project top-level", async () => {
      const rawProfile = {
        sub: "user-uuid-mix",
        email: "mix@example.com",
        email_verified: true,
        name: "Mix",
        preferred_username: "mix",
        given_name: "Mix",
        family_name: "Mix",
        policy: [],
        groups: ["/legacy/group"],
        organization: {
          vericura: { groups: ["/lab"] },
        },
      };

      const result = await profileFromRaw(rawProfile);

      // The profile has no entitlement fields at all; the raw memberships
      // live on under the alias and orgEntitlements derives from them.
      expect(result.organizations.vericura.groups).toEqual(["lab"]);
    });
  });

  describe("Multi-org claim", () => {
    const multiOrgProfile = (overrides?: Record<string, unknown>) => ({
      sub: "uuid-multi",
      email: "multi@example.com",
      email_verified: true,
      name: "Multi",
      preferred_username: "multi",
      given_name: "Multi",
      family_name: "Org",
      policy: [],
      groups: [],
      organization: {
        vericura: { id: "org-vericura", groups: ["/lab", "/lab/admins"], tier: ["pro"] },
        ascent: { id: "org-ascent", groups: ["/research"], tier: ["basic"] },
        cytario: { groups: ["/admins"] },
      },
      ...overrides,
    });

    test("exposes every membership with its own attributes and groups", async () => {
      const result = profileFromRaw(multiOrgProfile());

      expect(Object.keys(result.organizations).sort()).toEqual(["ascent", "cytario", "vericura"]);
      expect(result.organizations.vericura).toEqual({
        id: "org-vericura",
        groups: ["lab", "lab/admins"],
        attributes: { tier: ["pro"] },
      });
      expect(result.organizations.ascent).toEqual({
        id: "org-ascent",
        groups: ["research"],
        attributes: { tier: ["basic"] },
      });
      // No `id` in the claim → the key is absent, never an undefined value.
      expect(result.organizations.cytario).not.toHaveProperty("id");
    });

    test("orgEntitlements derives the caller's requested alias", async () => {
      const { orgEntitlements } = await import("../getUserInfo");
      const profile = profileFromRaw(multiOrgProfile());

      const vericura = orgEntitlements(profile, "vericura");
      expect(vericura.groups).toEqual(["lab"]);
      expect(vericura.adminScopes).toEqual(["lab"]);
      expect(vericura.attributes).toEqual({ tier: ["pro"] });
    });

    test("an alias outside the memberships yields empty entitlements", async () => {
      const { orgEntitlements } = await import("../getUserInfo");
      const profile = profileFromRaw(multiOrgProfile());
      const revoked = orgEntitlements(profile, "revoked-org");

      expect(revoked.groups).toEqual([]);
      expect(revoked.adminScopes).toEqual([]);
      expect(revoked.attributes).toEqual({});
    });

    test("the org-root admins group derives the `*` admin scope under its alias", async () => {
      const { orgEntitlements } = await import("../getUserInfo");
      const profile = profileFromRaw(multiOrgProfile());
      const cytario = orgEntitlements(profile, "cytario");

      expect(cytario.adminScopes).toEqual(["*"]);
      expect(cytario.groups).toEqual([]);
    });

    test("yields an empty map for a zero-org token", async () => {
      const rawProfile = {
        sub: "zero-org-user",
        email: "z@example.com",
        email_verified: true,
        name: "Zero",
        preferred_username: "zero",
        given_name: "Z",
        family_name: "User",
        policy: [],
        groups: [],
      };
      const result = profileFromRaw(rawProfile);

      expect(result.organizations).toEqual({});
    });
  });

  describe("resolveActiveOrganization", () => {
    const membership = { groups: [], attributes: {} };

    test("returns undefined for an empty membership map", () => {
      expect(resolveActiveOrganization({})).toBeUndefined();
    });

    test("returns the preferred alias when present", () => {
      const organizations = { alpha: membership, zeta: membership };

      expect(resolveActiveOrganization(organizations, "zeta")).toBe("zeta");
    });

    test("ignores a preferred alias that is not a membership", () => {
      const organizations = { beta: membership, alpha: membership };

      expect(resolveActiveOrganization(organizations, "gamma")).toBe("alpha");
    });

    test("picks the first alias alphabetically, independent of claim order", () => {
      const organizations = { zulu: membership, alpha: membership, mike: membership };

      expect(resolveActiveOrganization(organizations)).toBe("alpha");
    });
  });

  describe("Zod Validation", () => {
    test("a claims payload that fails the schema yields null", async () => {
      // sub typed wrong — the schema's identity floor. A payload failing
      // validation yields null; the auth callback turns that into the
      // failed-login notification.
      const malformedProfile = {
        sub: 123,
        email: "user@example.com",
      };

      expect(profileFromAccessToken(forgeToken(malformedProfile))).toBeNull();
    });

    test("defaults policy and groups to [] when omitted by Keycloak", async () => {
      // Keycloak omits these claims entirely when the user has no group
      // memberships (the protocol mappers only emit them from group state).
      // Freshly-registered users hit this path before any group is assigned.
      const profileWithoutPolicy = {
        sub: "uuid-123",
        email_verified: true,
        name: "Test",
        preferred_username: "test",
        given_name: "Test",
        family_name: "User",
        email: "test@example.com",
      };

      const result = profileFromRaw(profileWithoutPolicy);

      expect(result.policy).toEqual([]);
    });
  });

  describe("toIdentity", () => {
    // The membership carries the org-root admins group; toIdentity derives
    // the `*` admin scope from it (the profile has no entitlement fields).
    const fullProfile: UserProfile = {
      sub: "user-uuid-123",
      email_verified: true,
      name: "Alice Doe",
      preferred_username: "alice",
      given_name: "Alice",
      family_name: "Doe",
      email: "alice@example.com",
      policy: ["default-policy"],
      organizations: {
        testcorp: {
          groups: ["lab", "admins"],
          attributes: { subscription_status: ["active"] },
        },
      },
    };

    test("derives the tenant-relevant subset for the request org", () => {
      expect(toIdentity(fullProfile, "testcorp")).toEqual({
        sub: "user-uuid-123",
        organization: "testcorp",
        organizationAttributes: { subscription_status: ["active"] },
        groups: ["lab"],
        adminScopes: ["*"],
      });
    });

    test("the org comes from the argument, never the profile", () => {
      const identity = toIdentity(fullProfile, "another-org");
      expect(identity.organization).toBe("another-org");
    });

    test("drops PII fields (name, email, preferred_username, policy)", () => {
      const identity = toIdentity(fullProfile, "testcorp") as unknown as Record<string, unknown>;
      expect(identity).not.toHaveProperty("name");
      expect(identity).not.toHaveProperty("email");
      expect(identity).not.toHaveProperty("preferred_username");
      expect(identity).not.toHaveProperty("policy");
    });
  });

  describe("Error Cases", () => {
    test("a malformed access token yields null, not a throw", () => {
      expect(profileFromAccessToken("not-a-jwt")).toBeNull();
    });

    test("a valid JWT whose claims fail the schema yields null", () => {
      // sub missing — the schema's one required identity field.
      expect(profileFromAccessToken(forgeToken({ email: "x@y.z" }))).toBeNull();
    });
  });
});
