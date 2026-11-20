import { ensureOrganizationRedirectUrl, inviteOrganizationUser } from "../keycloakAdmin";

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
      clientId: "cytario-web",
    },
    endpoints: {
      webapp: "https://app.cytar.io",
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

  // The invitation link must target account-console: KC 26.8 builds a
  // client-targeted link without redirect_uri, which the authorization
  // endpoint rejects whenever the client has more than one valid redirect
  // URI — dev's cytario-web does, so the link died with
  // "Invalid parameter: redirect_uri".
  test("sends no client_id, so the link targets account-console", async () => {
    const fetchMock = mockFetchOk();

    await inviteOrganizationUser("org-uuid", "alice@example.com");

    const body = new URLSearchParams({ email: "alice@example.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/members/invite-user`,
      expect.objectContaining({
        method: "POST",
        body: body.toString(),
      }),
    );
  });

  test("sends only the email in the form body", async () => {
    const fetchMock = mockFetchOk();

    await inviteOrganizationUser("org-uuid", "bob@example.com");

    const body = new URLSearchParams({ email: "bob@example.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/members/invite-user`,
      expect.objectContaining({ body: body.toString() }),
    );
  });
});

describe("ensureOrganizationRedirectUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const org = (redirectUrl: string | undefined) => ({
    id: "org-uuid",
    name: "E2E",
    alias: "e2e",
    redirectUrl,
  });

  test("is a no-op when the redirectUrl already is the app origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(org("https://app.cytar.io")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureOrganizationRedirectUrl("org-uuid");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("PUTs the app origin when the org carries a different or missing redirectUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(org(undefined)),
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureOrganizationRedirectUrl("org-uuid");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`${BASE}/organizations/org-uuid`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).redirectUrl).toBe("https://app.cytar.io");
  });
});
