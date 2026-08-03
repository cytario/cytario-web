vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
      adminClientId: "cytario-web-admin",
      adminClientSecret: "test-secret",
      jobBrokerClientId: "job-broker",
      jobBrokerClientSecret: "broker-secret",
    },
  },
}));

const TOKEN_URL = "http://localhost:8080/realms/master/protocol/openid-connect/token";

async function importGetAdminToken() {
  const mod = await import("../keycloakAdmin/serviceAccountToken");
  return mod.getAdminToken;
}

async function importGetJobBrokerToken() {
  const mod = await import("../keycloakAdmin/serviceAccountToken");
  return mod.getJobBrokerToken;
}

describe("getAdminToken", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    // Re-import to reset module-level cache
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("fetches token via client_credentials grant", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "token-abc", expires_in: 300 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getAdminToken = await importGetAdminToken();
    const token = await getAdminToken();

    expect(token).toBe("token-abc");
    expect(fetchMock).toHaveBeenCalledWith(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: expect.any(URLSearchParams),
    });

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("cytario-web-admin");
    expect(body.get("client_secret")).toBe("test-secret");
  });

  test("returns cached token on subsequent calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "token-abc", expires_in: 300 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getAdminToken = await importGetAdminToken();
    await getAdminToken();
    await getAdminToken();
    await getAdminToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("refreshes token when approaching expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "token-1", expires_in: 60 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "token-2", expires_in: 300 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const getAdminToken = await importGetAdminToken();

    const first = await getAdminToken();
    expect(first).toBe("token-1");

    // Advance past the 30s buffer (60s - 30s = 30s remaining, so at 31s it should refresh)
    vi.advanceTimersByTime(31_000);

    const second = await getAdminToken();
    expect(second).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not refresh token before expiry buffer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "token-1", expires_in: 300 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getAdminToken = await importGetAdminToken();

    await getAdminToken();
    vi.advanceTimersByTime(200_000); // Well within 300s - 30s buffer
    await getAdminToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws and clears cache on token endpoint error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "token-retry", expires_in: 300 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const getAdminToken = await importGetAdminToken();

    await expect(getAdminToken()).rejects.toThrow(
      "Failed to obtain admin service account token: 401 Unauthorized",
    );

    // After failure, next call should retry (cache was cleared)
    const token = await getAdminToken();
    expect(token).toBe("token-retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getJobBrokerToken", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("fetches token via client_credentials grant as job-broker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "broker-token", expires_in: 300 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getJobBrokerToken = await importGetJobBrokerToken();
    const token = await getJobBrokerToken();

    expect(token).toBe("broker-token");
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("job-broker");
    expect(body.get("client_secret")).toBe("broker-secret");
  });

  test("maintains an independent cache from the admin token", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      const token = body.get("client_id") === "job-broker" ? "broker-token" : "admin-token";
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: token, expires_in: 300 }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const getAdminToken = await importGetAdminToken();
    const getJobBrokerToken = await importGetJobBrokerToken();

    const admin = await getAdminToken();
    const broker = await getJobBrokerToken();

    expect(admin).toBe("admin-token");
    expect(broker).toBe("broker-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("throws when job-broker creds are not configured", async () => {
    vi.doMock("~/config", () => ({
      cytarioConfig: {
        auth: {
          baseUrl: "http://localhost:8080/realms/master",
          adminClientId: "cytario-web-admin",
          adminClientSecret: "test-secret",
          jobBrokerClientId: undefined,
          jobBrokerClientSecret: undefined,
        },
      },
    }));
    vi.resetModules();

    const getJobBrokerToken = await importGetJobBrokerToken();
    await expect(getJobBrokerToken()).rejects.toThrow("Job broker client is not configured");

    vi.doUnmock("~/config");
  });
});
