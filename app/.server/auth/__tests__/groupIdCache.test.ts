import { createGroup, inviteUser } from "../keycloakAdmin";
import { KeycloakAdminError } from "../keycloakAdmin/client";
import {
  __resetGroupIdCache,
  cacheGroupId,
  findGroupByPath,
  findGroupIdByPath,
  invalidateGroupIdCache,
} from "../keycloakAdmin/groups";

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

const mockTopLevelTree = [
  {
    id: "root",
    name: "cytario",
    path: "/cytario",
    subGroups: [mockParentGroup],
  },
];

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

beforeEach(() => {
  vi.restoreAllMocks();
  __resetGroupIdCache();
});

describe("fetchGroups URL contract", () => {
  test("includes search, exact=true, and max for non-empty term", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTopLevelTree),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await findGroupByPath("cytario");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/groups?");
    expect(url).toContain("search=cytario");
    expect(url).toContain("exact=true");
    expect(url).toContain("max=1000");
  });
});

describe("findGroupIdByPath cache behavior", () => {
  test("cache hit returns ID without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    cacheGroupId("cytario/lab", "parent-123");

    const id = await findGroupIdByPath("cytario/lab");

    expect(id).toBe("parent-123");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("cache miss falls back to findGroupByPath and warms the cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTopLevelTree),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await findGroupIdByPath("cytario/lab");
    const second = await findGroupIdByPath("cytario/lab");

    expect(first).toBe("parent-123");
    expect(second).toBe("parent-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("findGroupByPath populates the cache as a side effect", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTopLevelTree),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await findGroupByPath("cytario/lab");
    fetchMock.mockClear();

    const id = await findGroupIdByPath("cytario/lab");

    expect(id).toBe("parent-123");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns undefined for a missing path without poisoning the cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await findGroupIdByPath("nonexistent");
    expect(first).toBeUndefined();

    const second = await findGroupIdByPath("nonexistent");
    expect(second).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateGroupIdCache", () => {
  test("drops only the named entry", async () => {
    cacheGroupId("cytario/lab", "parent-123");
    cacheGroupId("cytario/other", "other-456");

    invalidateGroupIdCache("cytario/lab");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await findGroupIdByPath("cytario/other")).toBe("other-456");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createGroup cache integration", () => {
  test("pre-populates cache for new group and its admins subgroup", async () => {
    mockFetchSequence([
      // findGroupByPath → fetchGroups
      { json: () => Promise.resolve(mockTopLevelTree) },
      // POST /groups/{parentId}/children → new group
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/new-group-id` }),
      },
      // POST /groups/{newGroupId}/children → admins subgroup
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/admins-group-id` }),
      },
    ]);

    await createGroup("cytario/lab", "Ultivue");

    // Cache should now be warm for both the new group and its admins subgroup.
    const verifyMock = vi.fn();
    vi.stubGlobal("fetch", verifyMock);

    expect(await findGroupIdByPath("cytario/lab/Ultivue")).toBe("new-group-id");
    expect(await findGroupIdByPath("cytario/lab/Ultivue/admins")).toBe(
      "admins-group-id",
    );
    expect(verifyMock).not.toHaveBeenCalled();
  });

  test("invalidates parent cache when POST returns 404", async () => {
    cacheGroupId("cytario/lab", "stale-parent-id");

    const fetchMock = mockFetchSequence([
      // POST /groups/stale-parent-id/children → 404
      { ok: false, status: 404, statusText: "Not Found" },
    ]);

    await expect(createGroup("cytario/lab", "Ultivue")).rejects.toBeInstanceOf(
      KeycloakAdminError,
    );

    // Cache entry should be gone, so the next lookup re-fetches.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTopLevelTree),
      headers: new Headers(),
    });

    const id = await findGroupIdByPath("cytario/lab");
    expect(id).toBe("parent-123");
  });

  test("rollback leaves cache untouched (no half-created entries)", async () => {
    mockFetchSequence([
      // findGroupByPath → fetchGroups (populates parent in cache)
      { json: () => Promise.resolve(mockTopLevelTree) },
      // POST /groups/{parentId}/children → success
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/groups/new-group-id` }),
      },
      // POST /groups/{newGroupId}/children (admins) → 500
      { ok: false, status: 500, statusText: "Internal Server Error" },
      // DELETE /groups/{newGroupId} → rollback success
      { ok: true, status: 204 },
    ]);

    await expect(createGroup("cytario/lab", "broken")).rejects.toBeInstanceOf(
      KeycloakAdminError,
    );

    const noFetch = vi.fn();
    vi.stubGlobal("fetch", noFetch);

    // Parent stays cached (it does exist). New paths are NOT cached.
    expect(await findGroupIdByPath("cytario/lab")).toBe("parent-123");
    expect(noFetch).not.toHaveBeenCalled();

    // Lookup of the rolled-back path is a cache miss — would re-fetch.
    const rolledBackFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", rolledBackFetch);

    expect(await findGroupIdByPath("cytario/lab/broken")).toBeUndefined();
    expect(rolledBackFetch).toHaveBeenCalled();
  });
});

describe("inviteUser cache invalidation", () => {
  test("invalidates the group path when PUT returns 404", async () => {
    cacheGroupId("cytario/lab", "stale-group-id");

    mockFetchSequence([
      // POST /users → success
      {
        status: 201,
        headers: new Headers({ location: `${BASE}/users/new-user-id` }),
      },
      // PUT /users/{id}/groups/{stale-group-id} → 404
      { ok: false, status: 404, statusText: "Not Found" },
    ]);

    await expect(
      inviteUser("test@example.com", "Test", "User", "cytario/lab", true),
    ).rejects.toBeInstanceOf(KeycloakAdminError);

    // Next lookup must re-fetch — the cached ID was stale.
    const refetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTopLevelTree),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", refetch);

    const id = await findGroupIdByPath("cytario/lab");
    expect(id).toBe("parent-123");
    expect(refetch).toHaveBeenCalled();
  });
});
