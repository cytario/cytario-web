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
