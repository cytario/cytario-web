vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/cytario",
      adminClientId: "cytario-web-admin",
      adminClientSecret: "admin-secret",
      jobBrokerClientId: "job-broker",
      jobBrokerClientSecret: "broker-secret",
    },
  },
}));

vi.mock("../keycloakAdmin/serviceAccountToken", () => ({
  getJobBrokerToken: vi.fn().mockResolvedValue("broker-bearer-token"),
}));

import { KeycloakAdminError } from "../keycloakAdmin/client";
import { getJobBrokerToken } from "../keycloakAdmin/serviceAccountToken";
import { revokeGrant } from "../revokeGrant";

const mockedGetJobBrokerToken = vi.mocked(getJobBrokerToken);

describe("revokeGrant (SDS-CY-080901, SRS-CY-416106)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetJobBrokerToken.mockResolvedValue("broker-bearer-token");
  });

  test("DELETEs the offline session with isOffline=true via the job-broker token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await revokeGrant("sess-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/admin/realms/cytario/sessions/sess-123?isOffline=true");
    expect(init.method).toBe("DELETE");
    expect(init.headers["Authorization"]).toBe("Bearer broker-bearer-token");
  });

  test("treats a 404 as success (idempotent revocation)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(revokeGrant("already-revoked")).resolves.toBeUndefined();
  });

  test("rethrows non-404 errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(revokeGrant("sess-123")).rejects.toThrow(/403/);
    expect(revokeGrant("sess-123")).rejects.toBeInstanceOf(KeycloakAdminError);
  });

  test("throws on an empty offlineSessionId", async () => {
    await expect(revokeGrant("")).rejects.toThrow("non-empty offlineSessionId");
  });

  test("uses the job-broker service account, not the broader cytario-web-admin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await revokeGrant("sess-123");

    expect(mockedGetJobBrokerToken).toHaveBeenCalledTimes(1);
  });

  test("URL-encodes the session id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await revokeGrant("a/b c?d=e");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/sessions/a%2Fb%20c%3Fd%3De?isOffline=true");
  });
});
