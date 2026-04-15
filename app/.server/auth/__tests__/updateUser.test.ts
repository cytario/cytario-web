import { updateUser } from "../keycloakAdmin";

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

describe("updateUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("sends PUT request with user data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await updateUser("user-123", {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      enabled: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/user-123`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          enabled: true,
        }),
      }),
    );
  });

  test("sends enabled: false when disabling user", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await updateUser("user-456", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      enabled: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/user-456`,
      expect.objectContaining({
        body: expect.stringContaining('"enabled":false'),
      }),
    );
  });

  test("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    await expect(
      updateUser("nonexistent", {
        firstName: "X",
        lastName: "Y",
        email: "x@y.com",
        enabled: true,
      }),
    ).rejects.toThrow("404 Not Found");
  });
});
