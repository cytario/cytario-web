import { beforeEach, describe, expect, test, vi } from "vitest";

const mockUpsertRecentlyViewed = vi.hoisted(() => vi.fn());
const mockGetConnectionByName = vi.hoisted(() => vi.fn());

vi.mock("~/utils/recentlyViewed.server", () => ({
  upsertRecentlyViewed: mockUpsertRecentlyViewed,
}));

vi.mock("~/utils/connectionConfig.server", () => ({
  getConnectionByName: mockGetConnectionByName,
}));

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {
    get: vi.fn(),
  },
  authMiddleware: vi.fn(),
}));

import { action } from "../recently-viewed";

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
    request: new Request("http://localhost/api/recently-viewed", {
      method,
      body: formData,
    }),
    context: mockContext,
    params: {},
  } as unknown as Parameters<typeof action>[0];
}

describe("POST /api/recently-viewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectionByName.mockResolvedValue({
      name: "my-bucket",
      bucketName: "my-bucket",
      provider: "minio",
    });
  });

  test("returns 200 with valid input", async () => {
    mockUpsertRecentlyViewed.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "file",
    });

    const response = await action(createActionArgs("POST", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockUpsertRecentlyViewed).toHaveBeenCalledWith("user-1", {
      connectionName: "my-bucket",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "file",
    });
  });

  test("returns 400 with invalid type", async () => {
    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "unknown",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockUpsertRecentlyViewed).not.toHaveBeenCalled();
  });

  test("returns 400 with missing connectionName", async () => {
    const formData = createFormData({
      connectionName: "",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "file",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockUpsertRecentlyViewed).not.toHaveBeenCalled();
  });

  test("returns 400 with missing name", async () => {
    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/image.ome.tiff",
      name: "",
      type: "file",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockUpsertRecentlyViewed).not.toHaveBeenCalled();
  });

  test("returns 405 for non-POST methods", async () => {
    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "file",
    });

    const response = await action(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(405);
  });

  test("accepts directory type", async () => {
    mockUpsertRecentlyViewed.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
      name: "images",
      type: "directory",
    });

    const response = await action(createActionArgs("POST", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockUpsertRecentlyViewed).toHaveBeenCalledWith("user-1", {
      connectionName: "my-bucket",
      pathName: "data/images/",
      name: "images",
      type: "directory",
    });
  });

  test("returns 404 when connectionName does not correspond to a visible connection", async () => {
    mockGetConnectionByName.mockResolvedValue(null);

    const formData = createFormData({
      connectionName: "hidden-bucket",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "file",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(404);
    expect(mockUpsertRecentlyViewed).not.toHaveBeenCalled();
  });

  test("returns 500 when upsert throws", async () => {
    mockUpsertRecentlyViewed.mockRejectedValue(new Error("DB connection lost"));

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/image.ome.tiff",
      name: "image.ome.tiff",
      type: "file",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(500);
  });
});
