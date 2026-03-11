import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockAddPinnedPath, mockRemovePinnedPath } = vi.hoisted(() => ({
  mockAddPinnedPath: vi.fn(),
  mockRemovePinnedPath: vi.fn(),
}));

const mockGetConnectionByName = vi.hoisted(() => vi.fn());

vi.mock("~/utils/pinnedPaths.server", () => ({
  addPinnedPath: mockAddPinnedPath,
  removePinnedPath: mockRemovePinnedPath,
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

import { action } from "../pinned";

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
    request: new Request("http://localhost/api/pinned", {
      method,
      body: formData,
    }),
    context: mockContext,
    params: {},
  } as unknown as Parameters<typeof action>[0];
}

describe("POST /api/pinned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectionByName.mockResolvedValue({
      name: "my-bucket",
      bucketName: "my-bucket",
      provider: "minio",
    });
  });

  test("pins a path with valid input", async () => {
    mockAddPinnedPath.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
      displayName: "images",
      totalSize: "1024000",
      lastModified: "1700000000000",
    });

    const response = await action(createActionArgs("POST", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddPinnedPath).toHaveBeenCalledWith("user-1", {
      connectionName: "my-bucket",
      pathName: "data/images/",
      displayName: "images",
      totalSize: 1024000,
      lastModified: 1700000000000,
    });
  });

  test("pins a path without optional fields", async () => {
    mockAddPinnedPath.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/",
      displayName: "data",
    });

    const response = await action(createActionArgs("POST", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddPinnedPath).toHaveBeenCalledWith("user-1", {
      connectionName: "my-bucket",
      pathName: "data/",
      displayName: "data",
    });
  });

  test("returns 400 with missing connectionName", async () => {
    const formData = createFormData({
      connectionName: "",
      pathName: "data/",
      displayName: "data",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockAddPinnedPath).not.toHaveBeenCalled();
  });

  test("returns 400 with missing displayName", async () => {
    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/",
      displayName: "",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockAddPinnedPath).not.toHaveBeenCalled();
  });

  test("returns 404 when connectionName does not correspond to a visible connection", async () => {
    mockGetConnectionByName.mockResolvedValue(null);

    const formData = createFormData({
      connectionName: "hidden-bucket",
      pathName: "data/images/",
      displayName: "images",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(404);
    expect(mockAddPinnedPath).not.toHaveBeenCalled();
  });

  test("returns 500 when addPinnedPath throws", async () => {
    mockAddPinnedPath.mockRejectedValue(new Error("DB connection lost"));

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
      displayName: "images",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(500);
  });
});

describe("DELETE /api/pinned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectionByName.mockResolvedValue({
      name: "my-bucket",
      bucketName: "my-bucket",
      provider: "minio",
    });
  });

  test("unpins a path with valid input", async () => {
    mockRemovePinnedPath.mockResolvedValue(undefined);

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
    });

    const response = await action(createActionArgs("DELETE", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockRemovePinnedPath).toHaveBeenCalledWith(
      "user-1",
      "my-bucket",
      "data/images/",
    );
  });

  test("returns 400 with missing connectionName on DELETE", async () => {
    const formData = createFormData({
      connectionName: "",
      pathName: "data/images/",
    });

    const response = await action(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(400);
    expect(mockRemovePinnedPath).not.toHaveBeenCalled();
  });

  test("returns 404 when connectionName does not correspond to a visible connection on DELETE", async () => {
    mockGetConnectionByName.mockResolvedValue(null);

    const formData = createFormData({
      connectionName: "hidden-bucket",
      pathName: "data/images/",
    });

    const response = await action(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(404);
    expect(mockRemovePinnedPath).not.toHaveBeenCalled();
  });

  test("returns 500 when removePinnedPath throws", async () => {
    mockRemovePinnedPath.mockRejectedValue(new Error("DB connection lost"));

    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/images/",
    });

    const response = await action(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(500);
  });
});

describe("unsupported methods", () => {
  test("returns 405 for PATCH method", async () => {
    const formData = createFormData({
      connectionName: "my-bucket",
      pathName: "data/",
    });

    const response = await action(createActionArgs("PATCH", formData));

    expect((response as Response).status).toBe(405);
  });
});
