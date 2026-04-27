import { createGroup } from "../keycloakAdmin";
import { __resetGroupIdCache } from "../keycloakAdmin/groups";

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

const mockParentGroup = {
  id: "parent-123",
  name: "lab",
  path: "/cytario/lab",
  subGroups: [],
};

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

describe("createGroup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetGroupIdCache();
  });

  test("creates group and admins subgroup under parent", async () => {
    const fetchMock = mockFetchSequence([
      // findGroupByPath → fetchGroups
      {
        json: () =>
          Promise.resolve([
            {
              id: "root",
              name: "cytario",
              path: "/cytario",
              subGroups: [mockParentGroup],
            },
          ]),
      },
      // POST /groups/{parentId}/children → new group
      {
        status: 201,
        headers: new Headers({
          location: `${BASE}/groups/new-group-id`,
        }),
      },
      // POST /groups/{newGroupId}/children → admins subgroup
      {
        status: 201,
        headers: new Headers({
          location: `${BASE}/groups/admins-group-id`,
        }),
      },
    ]);

    const result = await createGroup("cytario/lab", "Ultivue");

    expect(result).toEqual({
      id: "new-group-id",
      path: "cytario/lab/Ultivue",
      adminsGroupId: "admins-group-id",
    });

    // Created group under parent
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/groups/parent-123/children`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Ultivue" }),
      }),
    );

    // Created admins subgroup
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/groups/new-group-id/children`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "admins" }),
      }),
    );
  });

  test("throws 404 when parent scope does not exist", async () => {
    mockFetchSequence([
      // findGroupByPath → empty result
      { json: () => Promise.resolve([]) },
    ]);

    await expect(createGroup("nonexistent", "foo")).rejects.toThrow(
      "Parent group not found: nonexistent",
    );
  });

  test("propagates 409 from Keycloak for duplicate name", async () => {
    mockFetchSequence([
      // findGroupByPath
      {
        json: () =>
          Promise.resolve([
            {
              id: "root",
              name: "cytario",
              path: "/cytario",
              subGroups: [mockParentGroup],
            },
          ]),
      },
      // POST /groups/{parentId}/children → 409
      { ok: false, status: 409, statusText: "Conflict" },
    ]);

    await expect(
      createGroup("cytario/lab", "existing"),
    ).rejects.toThrow("409 Conflict");
  });

  test("rolls back parent group when admins subgroup creation fails", async () => {
    const fetchMock = mockFetchSequence([
      // findGroupByPath
      {
        json: () =>
          Promise.resolve([
            {
              id: "root",
              name: "cytario",
              path: "/cytario",
              subGroups: [mockParentGroup],
            },
          ]),
      },
      // POST /groups/{parentId}/children → success
      {
        status: 201,
        headers: new Headers({
          location: `${BASE}/groups/new-group-id`,
        }),
      },
      // POST /groups/{newGroupId}/children (admins) → 500
      { ok: false, status: 500, statusText: "Internal Server Error" },
      // DELETE /groups/{newGroupId} → rollback
      { ok: true, status: 204 },
    ]);

    await expect(
      createGroup("cytario/lab", "broken"),
    ).rejects.toThrow("500 Internal Server Error");

    // Verify rollback DELETE was called
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/groups/new-group-id`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  test("throws when Location header is missing", async () => {
    mockFetchSequence([
      // findGroupByPath
      {
        json: () =>
          Promise.resolve([
            {
              id: "root",
              name: "cytario",
              path: "/cytario",
              subGroups: [mockParentGroup],
            },
          ]),
      },
      // POST /groups/{parentId}/children → 201 but no Location
      { status: 201, headers: new Headers() },
    ]);

    await expect(
      createGroup("cytario/lab", "noheader"),
    ).rejects.toThrow("Missing Location header");
  });
});
