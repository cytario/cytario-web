import { beforeEach, describe, expect, test, vi } from "vitest";

const mockAddFavorite = vi.hoisted(() => vi.fn());
const mockGetConnection = vi.hoisted(() => vi.fn());

vi.mock("../favorites.server", () => ({
  addFavorite: mockAddFavorite,
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

import { addFavoriteAction } from "../addFavorite.action";

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
  } as unknown as Parameters<typeof addFavoriteAction>[0];
}

describe("addFavorite action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnection.mockResolvedValue({
      name: "my-bucket",
      id: "conn-uuid-42",
      bucketName: "my-bucket",
      provider: "minio",
    });
  });

  test("adds a favorite with valid input", async () => {
    mockAddFavorite.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionId: "conn-uuid-42",
      pathName: "data/images/",
      displayName: "images",
      totalSize: "1024000",
      lastModified: "1700000000000",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddFavorite).toHaveBeenCalledWith("user-1", {
      connectionId: "conn-uuid-42",
      connectionName: "my-bucket",
      pathName: "data/images/",
      displayName: "images",
      totalSize: 1024000,
      lastModified: 1700000000000,
    });
  });

  test("adds a favorite without optional fields", async () => {
    mockAddFavorite.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionId: "conn-uuid-42",
      pathName: "data/",
      displayName: "data",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddFavorite).toHaveBeenCalledWith("user-1", {
      connectionId: "conn-uuid-42",
      connectionName: "my-bucket",
      pathName: "data/",
      displayName: "data",
    });
  });

  test("adds a connection-root favorite with empty pathName", async () => {
    mockAddFavorite.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionId: "conn-uuid-42",
      pathName: "",
      displayName: "my-bucket",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddFavorite).toHaveBeenCalledWith("user-1", {
      connectionId: "conn-uuid-42",
      connectionName: "my-bucket",
      pathName: "",
      displayName: "my-bucket",
    });
  });

  test("returns 400 with missing connectionName", async () => {
    const formData = createFormData({
      connectionId: "",
      pathName: "data/",
      displayName: "data",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));

    expect((response as Response).status).toBe(400);
    expect(mockAddFavorite).not.toHaveBeenCalled();
  });

  test("returns 400 with missing displayName", async () => {
    const formData = createFormData({
      connectionId: "conn-uuid-42",
      pathName: "data/",
      displayName: "",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));

    expect((response as Response).status).toBe(400);
    expect(mockAddFavorite).not.toHaveBeenCalled();
  });

  test("returns 404 when connectionName does not correspond to a visible connection", async () => {
    mockGetConnection.mockResolvedValue(null);

    const formData = createFormData({
      connectionId: "hidden-bucket",
      pathName: "data/images/",
      displayName: "images",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));

    expect((response as Response).status).toBe(404);
    expect(mockAddFavorite).not.toHaveBeenCalled();
  });

  test("returns 500 when addFavorite throws", async () => {
    mockAddFavorite.mockRejectedValue(new Error("DB connection lost"));

    const formData = createFormData({
      connectionId: "conn-uuid-42",
      pathName: "data/images/",
      displayName: "images",
    });

    const response = await addFavoriteAction(createActionArgs("PUT", formData));

    expect((response as Response).status).toBe(500);
  });
});
