import {
  getUserInfo,
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
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token-123");

      expect(result).toEqual(
        expect.objectContaining({
          sub: "user-uuid-123",
          email: "user@example.com",
          groups: ["org1/lab"],
          adminScopes: ["org1/lab"],
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

    test("uses correct userinfo endpoint from wellKnown", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile()),
      });

      await getUserInfo("access-token");

      expect(mockFetch).toHaveBeenCalledWith(mockUserinfoEndpoint, expect.any(Object));
    });

    test("sends Bearer token in Authorization header", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile()),
      });

      await getUserInfo("my-access-token-xyz");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer my-access-token-xyz");
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
        groups: ["admin", "users"],
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fullProfile),
      });

      const result = await getUserInfo("token");

      expect(result.sub).toBe("uuid-456");
      expect(result.email_verified).toBe(true);
      expect(result.name).toBe("Full Name");
      expect(result.preferred_username).toBe("fullname");
      expect(result.given_name).toBe("Full");
      expect(result.family_name).toBe("Name");
      expect(result.email).toBe("full@example.com");
      expect(result.policy).toEqual(["default-policy"]);
      expect(result.groups).toEqual(["admin", "users"]);
    });
  });

  describe("Organization Claim", () => {
    test("extracts active org alias and nested groups", async () => {
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("vericura");
      expect(result.groups).toEqual(["lab", "customers/ascent-pharma"]);
      expect(result.adminScopes).toEqual([]);
    });

    test("root /admins becomes the `*` (org-root) admin scope", async () => {
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("cytario");
      expect(result.adminScopes).toEqual(["*"]);
      expect(result.groups).toEqual([]);
    });

    test("nested admin groups become their parent scopes", async () => {
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("vericura");
      expect(result.adminScopes).toEqual(["*", "customers/ascent-pharma"]);
      expect(result.groups).toEqual([]);
    });

    test("returns undefined organization when claim is absent", async () => {
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBeUndefined();
      expect(result.groups).toEqual([]);
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("testcorp");
      // Multivalued attrs keep all their values — the host does not collapse.
      expect(result.organizationAttributes).toEqual({
        subscription_status: ["active"],
        subscription_period_end: ["2026-12-31", "ignored"],
      });
      // Host-owned keys never leak into the opaque attribute map.
      expect(result.organizationAttributes).not.toHaveProperty("id");
      expect(result.organizationAttributes).not.toHaveProperty("groups");
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("testcorp");
      expect(result.organizationAttributes).toEqual({
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organizationAttributes).toEqual({ subscription_status: ["active"] });
      expect(result.organizationAttributes).not.toHaveProperty("billing_email");
      expect(result.organizationAttributes).not.toHaveProperty("oversized");
    });

    test("freezes the attribute map so a consumer cannot mutate it", async () => {
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

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rawProfile) });

      const result = await getUserInfo("access-token");

      expect(Object.isFrozen(result.organizationAttributes)).toBe(true);
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("testcorp");
      // Scalar is wrapped to a one-element array; a multivalued attr keeps all
      // its (string) values; empty and non-string-only attrs are dropped.
      expect(result.organizationAttributes).toEqual({
        subscription_status: ["active"],
        plan: ["pro", "ignored"],
      });
      expect(result.organizationAttributes).not.toHaveProperty("id");
      expect(result.organizationAttributes).not.toHaveProperty("empty_attr");
      expect(result.organizationAttributes).not.toHaveProperty("numeric_attr");
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.organizationAttributes).toEqual({});
    });

    test("nested organization groups take precedence over top-level legacy groups", async () => {
      const rawProfile = {
        sub: "user-uuid-mix",
        email: "mix@example.com",
        email_verified: true,
        name: "Mix",
        preferred_username: "mix",
        given_name: "Mix",
        family_name: "User",
        policy: [],
        groups: ["/legacy/group"],
        organization: {
          vericura: { groups: ["/lab"] },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawProfile),
      });

      const result = await getUserInfo("access-token");

      expect(result.groups).toEqual(["lab"]);
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
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(multiOrgProfile()) });

      const result = await getUserInfo("access-token");

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

    test("defaults to the first alias alphabetically when nothing is preferred", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(multiOrgProfile()) });

      const result = await getUserInfo("access-token");

      expect(result.organization).toBe("ascent");
      expect(result.organizationAttributes).toEqual({ tier: ["basic"] });
      expect(result.groups).toEqual(["research"]);
      expect(result.adminScopes).toEqual([]);
    });

    test("honours a preferred alias the token still carries", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(multiOrgProfile()) });

      const result = await getUserInfo("access-token", "vericura");

      expect(result.organization).toBe("vericura");
      expect(result.organizationAttributes).toEqual({ tier: ["pro"] });
      expect(result.groups).toEqual(["lab"]);
      expect(result.adminScopes).toEqual(["lab"]);
    });

    test("falls back to the first alias when the preferred org is no longer a membership", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(multiOrgProfile()) });

      const result = await getUserInfo("access-token", "revoked-org");

      expect(result.organization).toBe("ascent");
      expect(result.groups).toEqual(["research"]);
    });

    test("derives the active-org projection, not another org's", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(multiOrgProfile()) });

      const result = await getUserInfo("access-token", "cytario");

      expect(result.organization).toBe("cytario");
      expect(result.adminScopes).toEqual(["*"]);
      expect(result.groups).toEqual([]);
      expect(result.organizationAttributes).toEqual({});
    });

    test("yields no active org and an empty map for a zero-org token", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(multiOrgProfile({ organization: undefined })),
      });

      const result = await getUserInfo("access-token", "vericura");

      expect(result.organization).toBeUndefined();
      expect(result.organizations).toEqual({});
      expect(result.organizationAttributes).toEqual({});
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
    test("throws ZodError for malformed userinfo response", async () => {
      const malformedProfile = {
        sub: "uuid-123",
        email: "user@example.com",
        // Missing required fields: name, preferred_username, etc.
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(malformedProfile),
      });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(getUserInfo("access-token")).rejects.toThrow();
      consoleSpy.mockRestore();
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

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(profileWithoutPolicy),
      });

      const result = await getUserInfo("access-token");

      expect(result.policy).toEqual([]);
      expect(result.groups).toEqual([]);
      expect(result.adminScopes).toEqual([]);
    });
  });

  describe("toIdentity", () => {
    const fullProfile: UserProfile = {
      sub: "user-uuid-123",
      email_verified: true,
      name: "Alice Doe",
      preferred_username: "alice",
      given_name: "Alice",
      family_name: "Doe",
      email: "alice@example.com",
      policy: ["default-policy"],
      organization: "testcorp",
      organizations: {
        testcorp: {
          groups: ["lab"],
          attributes: { subscription_status: ["active"] },
        },
      },
      organizationAttributes: { subscription_status: ["active"] },
      groups: ["lab"],
      adminScopes: ["*"],
    };

    test("projects the tenant-relevant subset", () => {
      expect(toIdentity(fullProfile)).toEqual({
        sub: "user-uuid-123",
        organization: "testcorp",
        organizationAttributes: { subscription_status: ["active"] },
        groups: ["lab"],
        adminScopes: ["*"],
      });
    });

    test("drops PII fields (name, email, preferred_username, policy)", () => {
      const identity = toIdentity(fullProfile) as unknown as Record<string, unknown>;
      expect(identity).not.toHaveProperty("name");
      expect(identity).not.toHaveProperty("email");
      expect(identity).not.toHaveProperty("preferred_username");
      expect(identity).not.toHaveProperty("policy");
    });
  });

  describe("Error Cases", () => {
    test("throws on non-200 response with error message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid token"),
      });

      await expect(getUserInfo("invalid-token")).rejects.toThrow(
        "UserInfo fetch failed: 401 - Invalid token",
      );
    });

    test("throws on 403 forbidden response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Access denied"),
      });

      await expect(getUserInfo("access-token")).rejects.toThrow(
        "UserInfo fetch failed: 403 - Access denied",
      );
    });

    test("throws on network failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(getUserInfo("access-token")).rejects.toThrow("Network error");
    });

    test("throws when wellKnown endpoints fetch fails", async () => {
      vi.mocked(getWellKnownEndpoints).mockRejectedValue(
        new Error("Failed to fetch well-known configuration"),
      );

      await expect(getUserInfo("access-token")).rejects.toThrow(
        "Failed to fetch well-known configuration",
      );
    });
  });
});
