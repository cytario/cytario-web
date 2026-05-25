import { createGroup } from "../keycloakAdmin";

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
    },
  },
}));

vi.mock("../keycloakAdmin/serviceAccountToken", () => ({
  getAdminToken: vi.fn().mockResolvedValue("mock-admin-token"),
}));

const BASE = "http://localhost:8080/admin/realms/master";

function mockFetchSequence(responses: Array<Partial<Response>>) {
  const fn = vi.fn();
  for (const res of responses) {
    fn.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(null),
      headers: new Headers(),
      ...res,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const orgLookupResponse = {
  json: () => Promise.resolve([{ id: "org-uuid", name: "Cytario", alias: "cytario" }]),
};

describe("createGroup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("org-root parent creates a top-level group via the Organizations API", async () => {
    const fetchMock = mockFetchSequence([
      orgLookupResponse,
      // POST /organizations/{orgId}/groups
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/new-top-id` }),
      },
      // POST /organizations/{orgId}/groups/{newGroupId}/children
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/admins-top-id` }),
      },
    ]);

    const result = await createGroup("*", "Lab", "cytario");

    expect(result).toEqual({
      id: "new-top-id",
      path: "Lab",
      adminsGroupId: "admins-top-id",
      orgId: "org-uuid",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/groups`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Lab" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/groups/new-top-id/children`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "admins" }),
      }),
    );
  });

  test("nested parent looks up the parent within the org and posts to its children", async () => {
    const fetchMock = mockFetchSequence([
      orgLookupResponse,
      // GET /organizations/{orgId}/groups/group-by-path/{path}
      {
        json: () => Promise.resolve({ id: "parent-id", name: "lab", path: "/lab", subGroups: [] }),
      },
      // POST /organizations/{orgId}/groups/{parentId}/children → new group
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/new-id` }),
      },
      // POST /organizations/{orgId}/groups/{newGroupId}/children → admins
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/admins-id` }),
      },
    ]);

    const result = await createGroup("lab", "Ultivue", "cytario");

    expect(result).toEqual({
      id: "new-id",
      path: "lab/Ultivue",
      adminsGroupId: "admins-id",
      orgId: "org-uuid",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/groups/group-by-path/lab`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/groups/parent-id/children`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Ultivue" }),
      }),
    );
  });

  test("throws 404 when the nested parent path does not resolve within the org", async () => {
    mockFetchSequence([
      orgLookupResponse,
      // GET org group-by-path → 404 surfaces as KeycloakAdminError → undefined
      { ok: false, status: 404, statusText: "Not Found" },
    ]);

    await expect(createGroup("nonexistent", "foo", "cytario")).rejects.toThrow(
      "Parent group not found in organization: nonexistent",
    );
  });

  test("propagates 409 from Keycloak for duplicate name", async () => {
    mockFetchSequence([
      orgLookupResponse,
      // POST org top-level → 409
      { ok: false, status: 409, statusText: "Conflict" },
    ]);

    await expect(createGroup("*", "existing", "cytario")).rejects.toThrow("409 Conflict");
  });

  test("rolls back the parent group when admins subgroup creation fails", async () => {
    const fetchMock = mockFetchSequence([
      orgLookupResponse,
      // POST org top-level → success
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/new-id` }),
      },
      // POST admins → 500
      { ok: false, status: 500, statusText: "Internal Server Error" },
      // DELETE rollback → success
      { ok: true, status: 204 },
    ]);

    await expect(createGroup("*", "broken", "cytario")).rejects.toThrow(
      "500 Internal Server Error",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/organizations/org-uuid/groups/new-id`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  test("throws when Location header is missing", async () => {
    mockFetchSequence([
      orgLookupResponse,
      // POST org top-level → 201 but no Location
      { status: 201, headers: new Headers() },
    ]);

    await expect(createGroup("*", "noheader", "cytario")).rejects.toThrow(
      "Missing Location header",
    );
  });

  test("throws 400 when organization is missing", async () => {
    await expect(createGroup("*", "Lab", undefined)).rejects.toThrow(
      /Active organization is required/,
    );
  });

  test("throws 404 when the org alias has no Keycloak record", async () => {
    mockFetchSequence([{ json: () => Promise.resolve([]) }]);

    await expect(createGroup("*", "Lab", "unknown")).rejects.toThrow(
      "Organization not found: unknown",
    );
  });
});
