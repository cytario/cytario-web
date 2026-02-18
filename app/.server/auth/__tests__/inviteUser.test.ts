import { inviteUser } from "../keycloakAdmin";

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
    },
  },
}));

const BASE = "http://localhost:8080/admin/realms/master";

const mockGroup = {
  id: "group-123",
  name: "lab",
  path: "/vericura/lab",
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

describe("inviteUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("creates user, adds to group, sends email", async () => {
    const fetchMock = mockFetchSequence([
      // findGroupByPath → fetchGroups
      { json: () => Promise.resolve([{ ...mockGroup, path: "/vericura", name: "vericura", subGroups: [mockGroup] }]) },
      // POST /users → 201
      { status: 201, headers: new Headers({ location: `${BASE}/users/new-user-id` }) },
      // PUT /users/{id}/groups/{groupId} → 204
      { status: 204 },
      // PUT /users/{id}/execute-actions-email → 204
      { status: 204 },
    ]);

    await inviteUser("token", "test@example.com", "Test", "User", "vericura/lab");

    // POST /users with correct body
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "test@example.com",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          enabled: true,
        }),
      }),
    );

    // PUT to add user to group
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/new-user-id/groups/group-123`,
      expect.objectContaining({ method: "PUT" }),
    );

    // PUT to send email action
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/new-user-id/execute-actions-email`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(["UPDATE_PASSWORD"]),
      }),
    );
  });

  test("handles 409 conflict by adding existing user to group without email", async () => {
    const fetchMock = mockFetchSequence([
      // findGroupByPath → fetchGroups
      { json: () => Promise.resolve([{ ...mockGroup, path: "/vericura", name: "vericura", subGroups: [mockGroup] }]) },
      // POST /users → 409
      { ok: false, status: 409, statusText: "Conflict" },
      // GET /users?email=... → existing user
      { json: () => Promise.resolve([{ id: "existing-user-id", email: "test@example.com" }]) },
      // PUT /users/{id}/groups/{groupId}
      { status: 204 },
    ]);

    await inviteUser("token", "test@example.com", "Test", "User", "vericura/lab");

    // Should add existing user to group
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/existing-user-id/groups/group-123`,
      expect.objectContaining({ method: "PUT" }),
    );

    // Should NOT send email to existing user
    expect(fetchMock).not.toHaveBeenCalledWith(
      `${BASE}/users/existing-user-id/execute-actions-email`,
      expect.anything(),
    );
  });

  test("throws when group not found", async () => {
    mockFetchSequence([
      // findGroupByPath → empty result
      { json: () => Promise.resolve([]) },
    ]);

    await expect(
      inviteUser("token", "test@example.com", "Test", "User", "nonexistent"),
    ).rejects.toThrow("Group not found: nonexistent");
  });

  test("throws when 409 but user lookup returns empty", async () => {
    mockFetchSequence([
      // findGroupByPath
      { json: () => Promise.resolve([{ ...mockGroup, path: "/vericura", name: "vericura", subGroups: [mockGroup] }]) },
      // POST /users → 409
      { ok: false, status: 409, statusText: "Conflict" },
      // GET /users?email=... → empty
      { json: () => Promise.resolve([]) },
    ]);

    await expect(
      inviteUser("token", "test@example.com", "Test", "User", "vericura/lab"),
    ).rejects.toThrow("User conflict but not found: test@example.com");
  });

  test("throws on non-409 API error", async () => {
    mockFetchSequence([
      // findGroupByPath
      { json: () => Promise.resolve([{ ...mockGroup, path: "/vericura", name: "vericura", subGroups: [mockGroup] }]) },
      // POST /users → 500
      { ok: false, status: 500, statusText: "Internal Server Error" },
    ]);

    await expect(
      inviteUser("token", "test@example.com", "Test", "User", "vericura/lab"),
    ).rejects.toThrow("500 Internal Server Error");
  });

  test("throws when Location header is missing", async () => {
    mockFetchSequence([
      // findGroupByPath
      { json: () => Promise.resolve([{ ...mockGroup, path: "/vericura", name: "vericura", subGroups: [mockGroup] }]) },
      // POST /users → 201 but no Location header
      { status: 201, headers: new Headers() },
    ]);

    await expect(
      inviteUser("token", "test@example.com", "Test", "User", "vericura/lab"),
    ).rejects.toThrow("Missing Location header");
  });
});
