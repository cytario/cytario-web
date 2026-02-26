import { flattenGroups, getManageableScopes } from "../keycloakAdmin";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
    },
  },
}));

const mockGroupTree = [
  {
    id: "g1",
    name: "vericura",
    path: "/vericura",
    subGroups: [
      {
        id: "g2",
        name: "admins",
        path: "/vericura/admins",
        subGroups: [],
      },
      {
        id: "g3",
        name: "lab",
        path: "/vericura/lab",
        subGroups: [
          {
            id: "g4",
            name: "admins",
            path: "/vericura/lab/admins",
            subGroups: [],
          },
          {
            id: "g5",
            name: "team-x",
            path: "/vericura/lab/team-x",
            subGroups: [
              {
                id: "g6",
                name: "admins",
                path: "/vericura/lab/team-x/admins",
                subGroups: [],
              },
            ],
          },
          {
            id: "g7",
            name: "team-y",
            path: "/vericura/lab/team-y",
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

    expect(result).toEqual([
      "vericura",
      "vericura/lab",
      "vericura/lab/team-x",
      "vericura/lab/team-y",
    ]);
  });

  test("excludes groups named 'admins'", () => {
    const result = flattenGroups(mockGroupTree);

    expect(result).not.toContain("vericura/admins");
    expect(result).not.toContain("vericura/lab/admins");
    expect(result).not.toContain("vericura/lab/team-x/admins");
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
      groups: ["vericura/admins"],
      adminScopes: ["vericura"],
      isRealmAdmin: false,
    });

    const result = await getManageableScopes(user, "mock-token");

    expect(result).toEqual([
      "vericura",
      "vericura/lab",
      "vericura/lab/team-x",
      "vericura/lab/team-y",
    ]);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "http://localhost:8080/admin/realms/master/groups?",
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer mock-token" },
      }),
    );
  });

  test("returns empty array when user has no admin scopes", async () => {
    const user = mock.user({ adminScopes: [] });

    const result = await getManageableScopes(user, "mock-token");

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
      groups: ["vericura/admins"],
      adminScopes: ["vericura"],
    });

    const result = await getManageableScopes(user, "mock-token");

    expect(result).toEqual(["vericura"]);
  });

  test("falls back to adminScopes on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const user = mock.user({
      adminScopes: ["vericura"],
    });

    const result = await getManageableScopes(user, "mock-token");

    expect(result).toEqual(["vericura"]);
  });
});
