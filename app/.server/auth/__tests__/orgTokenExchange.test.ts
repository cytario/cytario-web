import {
  OrgTokenExchangeError,
  __resetOrgTokenCache,
  exchangeOrgToken,
  getOrExchangeOrgToken,
} from "../orgTokenExchange";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";
import { cytarioConfig } from "~/config";

vi.mock("../wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const encodeSegment = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const mintedToken = (expSecondsFromNow: number): string => {
  const now = Math.floor(Date.now() / 1000);
  return `${encodeSegment({ alg: "RS256" })}.${encodeSegment({ exp: now + expSecondsFromNow })}.sig`;
};

const tokenResponse = (accessToken: string) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      access_token: accessToken,
      issued_token_type: "urn:ietf:params:oauth:token-type:id_token",
    }),
});

describe("exchangeOrgToken", () => {
  const tokenEndpoint = "https://auth.example.com/token";

  beforeEach(() => {
    vi.clearAllMocks();
    __resetOrgTokenCache();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      token_endpoint: tokenEndpoint,
      authorization_endpoint: "https://auth.example.com/auth",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: "https://auth.example.com/userinfo",
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
    });
  });

  test("requests a narrow org scope and returns the decoded expiry", async () => {
    const accessToken = mintedToken(3600);
    mockFetch.mockResolvedValue(tokenResponse(accessToken));

    const exchanged = await exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" });

    expect(exchanged.organization).toBe("vericura");
    expect(exchanged.accessToken).toBe(accessToken);
    expect(exchanged.expiresAt).toBeGreaterThan(Date.now());

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(tokenEndpoint);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from(`${cytarioConfig.auth.clientId}:${cytarioConfig.auth.clientSecret}`).toString("base64")}`,
    );

    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(body.get("subject_token")).toBe("session-token");
    expect(body.get("subject_token_type")).toBe("urn:ietf:params:oauth:token-type:access_token");
    expect(body.get("requested_token_type")).toBe("urn:ietf:params:oauth:token-type:id_token");
    expect(body.get("scope")).toBe("openid organization:vericura");
  });

  test("fails closed on a non-ok response without leaking the body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: () => Promise.resolve('{"error":"access_denied","detail":"secret"}'),
    });

    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.toThrow(OrgTokenExchangeError);
    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.toThrow(/rejected: 400/);
    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.not.toThrow(/secret/);
  });

  test("fails closed when the response carries no token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "invalid_scope" }),
    });

    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.toThrow(/no token/);
  });

  test("fails closed when the issued type is not an ID token", async () => {
    const accessToken = mintedToken(3600);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: accessToken,
          issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
        }),
    });

    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.toThrow(/expected an ID token/);
  });

  test("fails closed when the response is not JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });

    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.toThrow(/invalid JSON/);
  });

  test("rejects an alias that would inject extra scope tokens", async () => {
    await expect(
      exchangeOrgToken({ alias: "vericura openid", subjectToken: "session-token" }),
    ).rejects.toThrow(/malformed/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects a token without an expiry", async () => {
    mockFetch.mockResolvedValue(tokenResponse(`${encodeSegment({ alg: "none" })}.e30.sig`));

    await expect(
      exchangeOrgToken({ alias: "vericura", subjectToken: "session-token" }),
    ).rejects.toThrow(/no expiry/);
  });
});

describe("getOrExchangeOrgToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetOrgTokenCache();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      token_endpoint: "https://auth.example.com/token",
      authorization_endpoint: "https://auth.example.com/auth",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: "https://auth.example.com/userinfo",
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
    });
  });

  test("reuses the minted token within its lifetime", async () => {
    mockFetch.mockReturnValue(tokenResponse(mintedToken(3600)));

    const first = await getOrExchangeOrgToken("session-1", "vericura", "session-token");
    const second = await getOrExchangeOrgToken("session-1", "vericura", "session-token");

    expect(second).toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("mints a separate token per org", async () => {
    mockFetch
      .mockReturnValueOnce(tokenResponse(mintedToken(3600)))
      .mockReturnValueOnce(tokenResponse(mintedToken(3600)));

    await getOrExchangeOrgToken("session-1", "vericura", "session-token");
    await getOrExchangeOrgToken("session-1", "cytar", "session-token");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[1][1].body as URLSearchParams).get("scope")).toBe(
      "openid organization:cytar",
    );
  });

  test("does not cache a token already inside the expiry buffer", async () => {
    mockFetch.mockReturnValue(tokenResponse(mintedToken(30)));

    await getOrExchangeOrgToken("session-1", "vericura", "session-token");
    await getOrExchangeOrgToken("session-1", "vericura", "session-token");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("propagates the exchange failure instead of falling back", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: () => Promise.resolve(""),
    });

    await expect(getOrExchangeOrgToken("session-1", "vericura", "session-token")).rejects.toThrow(
      OrgTokenExchangeError,
    );
  });
});
