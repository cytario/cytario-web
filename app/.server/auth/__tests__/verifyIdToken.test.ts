import { errors, jwtVerify, createRemoteJWKSet } from "jose";

import {
  IdTokenVerificationError,
  verifyIdToken,
} from "../verifyIdToken";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return {
    ...actual,
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn(() => "mock-jwks-function"),
  };
});

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
      new errors.JWSSignatureVerificationFailed(),
    );

    const result = await verifyIdToken("tampered-token");

    expect(result).toBeNull();
  });

  test("returns null for an expired token", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new errors.JWTExpired("token expired", {}),
    );

    const result = await verifyIdToken("expired-token");

    expect(result).toBeNull();
  });

  test("returns null for wrong issuer", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new errors.JWTClaimValidationFailed('"iss" claim check failed', {}),
    );

    const result = await verifyIdToken("wrong-issuer-token");

    expect(result).toBeNull();
  });

  test("throws IdTokenVerificationError on JWKS timeout", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new errors.JWKSTimeout(),
    );

    await expect(verifyIdToken("some-token")).rejects.toThrow(
      IdTokenVerificationError,
    );
    await expect(verifyIdToken("some-token")).rejects.toMatchObject({
      retryable: true,
      message: "JWKS fetch timed out",
    });
  });

  test("throws IdTokenVerificationError on network failure", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new TypeError("fetch failed"),
    );

    await expect(verifyIdToken("some-token")).rejects.toThrow(
      IdTokenVerificationError,
    );
    await expect(verifyIdToken("some-token")).rejects.toMatchObject({
      retryable: true,
    });
  });

  test("throws IdTokenVerificationError when JWKS endpoint is unreachable during setup", async () => {
    vi.mocked(createRemoteJWKSet).mockImplementation(() => {
      throw new Error("JWKS endpoint unreachable");
    });

    // Reset the cached JWKS by re-importing — this creates a fresh module
    // instance, so instanceof checks against the top-level import won't work.
    // Use name + retryable matching instead.
    vi.resetModules();
    const { verifyIdToken: freshVerify } = await import("../verifyIdToken");

    await expect(freshVerify("some-token")).rejects.toMatchObject({
      name: "IdTokenVerificationError",
      retryable: true,
    });
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
