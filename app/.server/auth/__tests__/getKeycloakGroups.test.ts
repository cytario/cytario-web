import { getManageableScopes } from "../keycloakAdmin";
import { flattenGroups } from "../keycloakAdmin/groups";
import mock from "~/utils/__tests__/__mocks__";

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

const mockGroupTree = [
  {
    id: "g1",
    name: "acme",
    path: "/acme",
    subGroups: [
      {
        id: "g2",
        name: "admins",
        path: "/acme/admins",
        subGroups: [],
      },
      {
        id: "g3",
        name: "lab",
        path: "/acme/lab",
        subGroups: [
          {
            id: "g4",
            name: "admins",
            path: "/acme/lab/admins",
            subGroups: [],
          },
          {
            id: "g5",
            name: "team-x",
            path: "/acme/lab/team-x",
            subGroups: [
              {
                id: "g6",
                name: "admins",
                path: "/acme/lab/team-x/admins",
                subGroups: [],
              },
            ],
          },
          {
            id: "g7",
            name: "team-y",
            path: "/acme/lab/team-y",
            subGroups: [],
          },
        ],
      },
    ],
  },
];

describe("flattenGroups", () => {
  test("flattens group tree to normalized paths", () => {
    const result = flattenGroups(mockGroupTree);

    expect(result).toEqual(["acme", "acme/lab", "acme/lab/team-x", "acme/lab/team-y"]);
  });

  test("excludes groups named 'admins'", () => {
    const result = flattenGroups(mockGroupTree);

    expect(result).not.toContain("acme/admins");
    expect(result).not.toContain("acme/lab/admins");
    expect(result).not.toContain("acme/lab/team-x/admins");
  });

  test("returns empty array for empty input", () => {
    expect(flattenGroups([])).toEqual([]);
  });
});

describe("getManageableScopes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("fetches and returns descendant groups for admin scopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGroupTree),
      }),
    );

    const user = mock.user({
      groups: ["acme/admins"],
      adminScopes: ["acme"],
      isRealmAdmin: false,
    });

    const result = await getManageableScopes(user);

    expect(result).toEqual(["acme", "acme/lab", "acme/lab/team-x", "acme/lab/team-y"]);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:8080/admin/realms/master/groups?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer "),
        }),
      }),
    );
  });

  test("returns empty array when user has no admin scopes", async () => {
    const user = mock.user({ adminScopes: [] });

    const result = await getManageableScopes(user);

    expect(result).toEqual([]);
  });

  test("falls back to adminScopes on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      }),
    );

    const user = mock.user({
      groups: ["acme/admins"],
      adminScopes: ["acme"],
    });

    const result = await getManageableScopes(user);

    expect(result).toEqual(["acme"]);
  });

  test("falls back to adminScopes on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const user = mock.user({
      adminScopes: ["acme"],
    });

    const result = await getManageableScopes(user);

    expect(result).toEqual(["acme"]);
  });
});
