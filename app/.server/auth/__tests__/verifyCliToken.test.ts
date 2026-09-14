import { jwtVerify } from "jose";

import { verifyCliToken } from "../verifyCliToken";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => "mock-jwks-function"),
}));

vi.mock("../wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
      cliClientId: "cytario-cli",
    },
  },
}));

describe("verifyCliToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
      authorization_endpoint: "",
      token_endpoint: "",
      revocation_endpoint: "",
      end_session_endpoint: "",
      userinfo_endpoint: "",
    });
  });

  test("returns payload for a token with a sub claim", async () => {
    const mockPayload = {
      sub: "user-123",
      iss: "https://auth.example.com/realms/test",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "RS256" },
    } as never);

    const result = await verifyCliToken("valid-token");

    expect(result).toEqual(mockPayload);
    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything(), {
      issuer: "https://auth.example.com/realms/test",
      clockTolerance: 30,
      audience: "cytario-cli",
    });
  });

  test("returns null when verification fails", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("invalid") as never);
    expect(await verifyCliToken("bad-token")).toBeNull();
  });

  test("returns null when the payload has no sub", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { iss: "https://auth.example.com/realms/test" },
      protectedHeader: { alg: "RS256" },
    } as never);
    expect(await verifyCliToken("subless-token")).toBeNull();
  });
});
