import { findGroupByPath } from "../keycloakAdmin";

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
            id: "g5",
            name: "team-x",
            path: "/vericura/lab/team-x",
            subGroups: [],
          },
        ],
      },
    ],
  },
];

describe("findGroupByPath", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGroupTree),
      }),
    );
  });

  test("finds top-level group", async () => {
    const result = await findGroupByPath("token", "vericura");
    expect(result).toMatchObject({ id: "g1", name: "vericura" });
  });

  test("finds nested group", async () => {
    const result = await findGroupByPath("token", "vericura/lab");
    expect(result).toMatchObject({ id: "g3", name: "lab" });
  });

  test("finds deeply nested group", async () => {
    const result = await findGroupByPath("token", "vericura/lab/team-x");
    expect(result).toMatchObject({ id: "g5", name: "team-x" });
  });

  test("returns undefined for non-existent path", async () => {
    const result = await findGroupByPath("token", "vericura/nonexistent");
    expect(result).toBeUndefined();
  });

  test("returns undefined when API returns empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );
    const result = await findGroupByPath("token", "nonexistent");
    expect(result).toBeUndefined();
  });
});
