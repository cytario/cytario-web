import { getUserInfo } from "../getUserInfo";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";
import mock from "~/utils/__tests__/__mocks__";

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
        policy: "string",
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
          isRealmAdmin: false,
        }),
      );
    });

    test("uses correct userinfo endpoint from wellKnown", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.user()),
      });

      await getUserInfo("access-token");

      expect(mockFetch).toHaveBeenCalledWith(
        mockUserinfoEndpoint,
        expect.any(Object)
      );
    });

    test("sends Bearer token in Authorization header", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.user()),
      });

      await getUserInfo("my-access-token-xyz");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer my-access-token-xyz");
    });

    test("returns all user profile fields", async () => {
      const fullProfile = mock.user({
        sub: "uuid-456",
        email_verified: true,
        name: "Full Name",
        preferred_username: "fullname",
        given_name: "Full",
        family_name: "Name",
        email: "full@example.com",
        policy: "default-policy",
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
      expect(result.policy).toBe("default-policy");
      expect(result.groups).toEqual(["admin", "users"]);
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
        "UserInfo fetch failed: 401 - Invalid token"
      );
    });

    test("throws on 403 forbidden response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Access denied"),
      });

      await expect(getUserInfo("access-token")).rejects.toThrow(
        "UserInfo fetch failed: 403 - Access denied"
      );
    });

    test("throws on network failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(getUserInfo("access-token")).rejects.toThrow("Network error");
    });

    test("throws when wellKnown endpoints fetch fails", async () => {
      vi.mocked(getWellKnownEndpoints).mockRejectedValue(
        new Error("Failed to fetch well-known configuration")
      );

      await expect(getUserInfo("access-token")).rejects.toThrow(
        "Failed to fetch well-known configuration"
      );
    });
  });
});
