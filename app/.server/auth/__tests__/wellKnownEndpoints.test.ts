// Ensure we use the real module, not any mock from other test files
vi.unmock("../wellKnownEndpoints");

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "https://auth.example.com/realms/test",
    },
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("getWellKnownEndpoints", () => {
  const mockEndpoints = {
    authorization_endpoint: "https://auth.example.com/auth",
    token_endpoint: "https://auth.example.com/token",
    revocation_endpoint: "https://auth.example.com/revoke",
    end_session_endpoint: "https://auth.example.com/logout",
    userinfo_endpoint: "https://auth.example.com/userinfo",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module to clear cached endpoints
    vi.resetModules();
  });

  describe("Fetching Endpoints", () => {
    test("fetches from well-known configuration URL", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEndpoints),
      });

      // Re-import to get fresh module without cache
      const { getWellKnownEndpoints: freshGet } = await import(
        "../wellKnownEndpoints"
      );
      await freshGet();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/realms/test/.well-known/openid-configuration"
      );
    });

    test("returns all endpoint URLs", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEndpoints),
      });

      const { getWellKnownEndpoints: freshGet } = await import(
        "../wellKnownEndpoints"
      );
      const result = await freshGet();

      expect(result).toEqual(mockEndpoints);
      expect(result.authorization_endpoint).toBe("https://auth.example.com/auth");
      expect(result.token_endpoint).toBe("https://auth.example.com/token");
      expect(result.end_session_endpoint).toBe("https://auth.example.com/logout");
      expect(result.userinfo_endpoint).toBe("https://auth.example.com/userinfo");
    });
  });

  describe("Caching", () => {
    test("returns cached endpoints on subsequent calls", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEndpoints),
      });

      const { getWellKnownEndpoints: freshGet } = await import(
        "../wellKnownEndpoints"
      );

      await freshGet();
      await freshGet();
      await freshGet();

      // Should only fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    test("throws on non-200 response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("Realm not found"),
      });

      const { getWellKnownEndpoints: freshGet } = await import(
        "../wellKnownEndpoints"
      );

      await expect(freshGet()).rejects.toThrow(
        "Failed to fetch well-known endpoints: 404 Not Found - Realm not found"
      );
    });

    test("throws on network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const { getWellKnownEndpoints: freshGet } = await import(
        "../wellKnownEndpoints"
      );

      await expect(freshGet()).rejects.toThrow("Network error");
    });

    test("clears cache on error", async () => {
      // First call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEndpoints),
      });

      const { getWellKnownEndpoints: freshGet } = await import(
        "../wellKnownEndpoints"
      );
      await freshGet();

      // Reset for second module import
      vi.resetModules();
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { getWellKnownEndpoints: freshGet2 } = await import(
        "../wellKnownEndpoints"
      );

      await expect(freshGet2()).rejects.toThrow("Network error");

      // Subsequent call should re-fetch (cache was cleared)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEndpoints),
      });

      const { getWellKnownEndpoints: freshGet3 } = await import(
        "../wellKnownEndpoints"
      );
      const result = await freshGet3();
      expect(result).toEqual(mockEndpoints);
    });
  });
});
