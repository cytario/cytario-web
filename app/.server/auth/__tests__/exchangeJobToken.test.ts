import { beforeEach, describe, expect, test, vi } from "vitest";

const wellKnownMock = vi.hoisted(() => vi.fn());

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/cytario",
      jobBrokerClientId: "job-broker",
      jobBrokerClientSecret: "broker-secret",
    },
  },
}));

vi.mock("../wellKnownEndpoints", () => ({
  getWellKnownEndpoints: wellKnownMock,
}));

vi.mock("../../hostRequestContext", () => ({
  hostRequestStorage: {
    getStore: () => ({ authTokens: { accessToken: "user-session-access-token" } }),
  },
}));

import { exchangeJobToken } from "../exchangeJobToken";

const TOKEN_URL = "http://localhost:8080/realms/cytario/protocol/openid-connect/token";

function mockResponse(body: Record<string, unknown>, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    text: () => Promise.resolve(ok ? "" : "error body"),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  wellKnownMock.mockResolvedValue({
    token_endpoint: TOKEN_URL,
    issuer: "http://localhost:8080/realms/cytario",
  });
});

describe("exchangeJobToken (SRS-CY-41901, SDS-CY-020105)", () => {
  test("returns the refresh_token as grant.token, not the access_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: "short-lived-access-token",
        expires_in: 300,
        refresh_token: "offline-refresh-token",
        refresh_expires_in: 604800,
        session_state: "offline-session-42",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const grant = await exchangeJobToken();

    expect(grant.token).toBe("offline-refresh-token");
    expect(grant.token).not.toBe("short-lived-access-token");
    expect(grant.offlineSessionId).toBe("offline-session-42");
  });

  test("expiresAt is derived from refresh_expires_in, not expires_in", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: "access",
        expires_in: 300,
        refresh_token: "refresh",
        refresh_expires_in: 604800,
        session_state: "sess",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const grant = await exchangeJobToken();

    // 604800s = 7 days from epoch start
    expect(grant.expiresAt.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    vi.useRealTimers();
  });

  test("falls back to expires_in when refresh_expires_in is absent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: "access",
        expires_in: 1800,
        refresh_token: "refresh",
        session_state: "sess",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const grant = await exchangeJobToken();

    // 1800s = 30 min
    expect(grant.expiresAt.toISOString()).toBe("2026-08-13T00:30:00.000Z");
    vi.useRealTimers();
  });

  test("throws when the response has no refresh_token (offline_access not granted)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: "access",
        expires_in: 300,
        session_state: "sess",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeJobToken()).rejects.toThrow(/no refresh_token/);
  });

  test("throws when the response has no session_state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: "access",
        expires_in: 300,
        refresh_token: "refresh",
        refresh_expires_in: 604800,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeJobToken()).rejects.toThrow(/no session_state/);
  });

  test("authenticates the exchange with job-broker client credentials (Basic)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        access_token: "access",
        expires_in: 300,
        refresh_token: "refresh",
        refresh_expires_in: 604800,
        session_state: "sess",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await exchangeJobToken();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("job-broker:broker-secret").toString("base64")}`);
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(body.get("subject_token")).toBe("user-session-access-token");
    expect(body.get("audience")).toBe("job-broker");
    expect(body.get("scope")).toBe("openid offline_access");
  });

  test("throws on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({}, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeJobToken()).rejects.toThrow(/Token exchange failed: 400/);
  });
});
