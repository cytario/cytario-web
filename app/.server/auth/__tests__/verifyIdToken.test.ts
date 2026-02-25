import { jwtVerify, createRemoteJWKSet } from "jose";

import { verifyIdToken } from "../verifyIdToken";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => "mock-jwks-function"),
}));

vi.mock("../wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

describe("verifyIdToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
      authorization_endpoint: "https://auth.example.com/auth",
      token_endpoint: "https://auth.example.com/token",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: "https://auth.example.com/userinfo",
    });
  });

  test("returns payload for a valid token", async () => {
    const mockPayload = {
      sub: "user-123",
      iss: "https://auth.example.com/realms/test",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "RS256" },
    } as never);

    const result = await verifyIdToken("valid-token");

    expect(result).toEqual(mockPayload);
    expect(jwtVerify).toHaveBeenCalledWith(
      "valid-token",
      "mock-jwks-function",
      { issuer: "https://auth.example.com/realms/test", clockTolerance: 30 },
    );
  });

  test("returns null for an invalid signature", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new Error("signature verification failed"),
    );

    const result = await verifyIdToken("tampered-token");

    expect(result).toBeNull();
  });

  test("returns null when JWKS fetch fails", async () => {
    vi.mocked(createRemoteJWKSet).mockImplementation(() => {
      throw new Error("JWKS endpoint unreachable");
    });

    // Reset the cached JWKS by re-importing
    vi.resetModules();
    const { verifyIdToken: freshVerify } = await import("../verifyIdToken");

    const result = await freshVerify("some-token");

    expect(result).toBeNull();
  });

  test("uses issuer from OIDC discovery for verification", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "user-123" },
      protectedHeader: { alg: "RS256" },
    } as never);

    await verifyIdToken("token");

    expect(jwtVerify).toHaveBeenCalledWith(
      "token",
      expect.anything(),
      expect.objectContaining({
        issuer: "https://auth.example.com/realms/test",
      }),
    );
  });
});
