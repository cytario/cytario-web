import { findGroupByPath } from "../keycloakAdmin";

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
            id: "g5",
            name: "team-x",
            path: "/acme/lab/team-x",
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
    const result = await findGroupByPath("acme");
    expect(result).toMatchObject({ id: "g1", name: "acme" });
  });

  test("finds nested group", async () => {
    const result = await findGroupByPath("acme/lab");
    expect(result).toMatchObject({ id: "g3", name: "lab" });
  });

  test("finds deeply nested group", async () => {
    const result = await findGroupByPath("acme/lab/team-x");
    expect(result).toMatchObject({ id: "g5", name: "team-x" });
  });

  test("returns undefined for non-existent path", async () => {
    const result = await findGroupByPath("acme/nonexistent");
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
    const result = await findGroupByPath("nonexistent");
    expect(result).toBeUndefined();
  });
});
