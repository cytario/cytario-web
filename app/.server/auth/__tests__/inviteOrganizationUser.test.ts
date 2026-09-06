import { inviteOrganizationUser } from "../keycloakAdmin";

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
      clientId: "cytario-web",
    },
  },
}));

vi.mock("../keycloakAdmin/serviceAccountToken", () => ({
  getAdminToken: vi.fn().mockResolvedValue("mock-admin-token"),
}));

const BASE = "http://localhost:8080/admin/realms/master";

function mockFetchOk() {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    json: () => Promise.resolve(null),
    headers: new Headers(),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("inviteOrganizationUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("targets the web client via client_id so the invite link redirects to the app, not the account console", async () => {
    const fetchMock = mockFetchOk();

    await inviteOrganizationUser("org-uuid", "alice@example.com", "Alice", "Doe");

    const body = new URLSearchParams({
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Doe",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/members/invite-user?client_id=cytario-web`,
      expect.objectContaining({
        method: "POST",
        body: body.toString(),
      }),
    );
  });

  test("omits unset firstName/lastName from the form body", async () => {
    const fetchMock = mockFetchOk();

    await inviteOrganizationUser("org-uuid", "bob@example.com");

    const body = new URLSearchParams({ email: "bob@example.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/members/invite-user?client_id=cytario-web`,
      expect.objectContaining({ body: body.toString() }),
    );
  });

  test("URL-encodes the client id", async () => {
    const { cytarioConfig } = await import("~/config");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    const weirdClient = "my client/with-specials";
    Object.defineProperty(cytarioConfig.auth, "clientId", {
      value: weirdClient,
      configurable: true,
    });

    const fetchMock = vi.mocked(fetch);
    await inviteOrganizationUser("org-uuid", "carol@example.com");
    Object.defineProperty(cytarioConfig.auth, "clientId", {
      value: "cytario-web",
      configurable: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/members/invite-user?client_id=${encodeURIComponent(weirdClient)}`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
