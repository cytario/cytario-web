import { beforeEach, describe, expect, test, vi } from "vitest";

const mockRemoveFavorite = vi.hoisted(() => vi.fn());
const mockGetConnection = vi.hoisted(() => vi.fn());

vi.mock("../favorites.server", () => ({
  removeFavorite: mockRemoveFavorite,
}));

vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: mockGetConnection,
}));

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {
    get: vi.fn(),
  },
  authMiddleware: vi.fn(),
}));

import { removeFavoriteAction } from "../removeFavorite.action";

function createFormData(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

function createActionArgs(method: string, formData: FormData) {
  const mockContext = {
    get: vi.fn().mockReturnValue({
      user: { sub: "user-1" },
    }),
  };

  return {
    request: new Request("http://localhost/favorites", {
      method,
      body: formData,
    }),
    context: mockContext,
    params: {},
  } as unknown as Parameters<typeof removeFavoriteAction>[0];
}

describe("removeFavorite action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnection.mockResolvedValue({
      name: "my-bucket",
      bucketName: "my-bucket",
      provider: "minio",
    });
  });

  test("removes a favorite with valid input", async () => {
    mockRemoveFavorite.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
    });

    const response = await removeFavoriteAction(createActionArgs("DELETE", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockRemoveFavorite).toHaveBeenCalledWith("user-1", "my-bucket", "data/images/");
  });

  test("returns 400 with missing connectionName", async () => {
    const formData = createFormData({
      connectionName: "",
      pathName: "data/images/",
    });

    const response = await removeFavoriteAction(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(400);
    expect(mockRemoveFavorite).not.toHaveBeenCalled();
  });

  test("returns 404 when connectionName does not correspond to a visible connection", async () => {
    mockGetConnection.mockResolvedValue(null);

    const formData = createFormData({
      connectionName: "hidden-bucket",
      pathName: "data/images/",
    });

    const response = await removeFavoriteAction(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(404);
    expect(mockRemoveFavorite).not.toHaveBeenCalled();
  });

  test("returns 500 when removeFavorite throws", async () => {
    mockRemoveFavorite.mockRejectedValue(new Error("DB connection lost"));

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
    });

    const response = await removeFavoriteAction(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(500);
  });
});
