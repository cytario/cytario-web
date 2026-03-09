import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockAddPinnedPath, mockRemovePinnedPath } = vi.hoisted(() => ({
  mockAddPinnedPath: vi.fn(),
  mockRemovePinnedPath: vi.fn(),
}));

vi.mock("~/utils/pinnedPaths.server", () => ({
  addPinnedPath: mockAddPinnedPath,
  removePinnedPath: mockRemovePinnedPath,
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
  });

  test("pins a path with valid input", async () => {
    mockAddPinnedPath.mockResolvedValue(undefined);

    const formData = createFormData({
      alias: "my-bucket",
      pathName: "data/images/",
      displayName: "images",
      totalSize: "1024000",
      lastModified: "1700000000000",
    });

    const response = await action(createActionArgs("POST", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddPinnedPath).toHaveBeenCalledWith("user-1", {
      alias: "my-bucket",
      pathName: "data/images/",
      displayName: "images",
      totalSize: 1024000,
      lastModified: 1700000000000,
    });
  });

  test("pins a path without optional fields", async () => {
    mockAddPinnedPath.mockResolvedValue(undefined);

    const formData = createFormData({
      alias: "my-bucket",
      pathName: "data/",
      displayName: "data",
    });

    const response = await action(createActionArgs("POST", formData));
    const json = await (response as Response).json();

    expect(json).toEqual({ ok: true });
    expect(mockAddPinnedPath).toHaveBeenCalledWith("user-1", {
      alias: "my-bucket",
      pathName: "data/",
      displayName: "data",
    });
  });

  test("returns 400 with missing alias", async () => {
    const formData = createFormData({
      alias: "",
      pathName: "data/",
      displayName: "data",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockAddPinnedPath).not.toHaveBeenCalled();
  });

  test("returns 400 with missing displayName", async () => {
    const formData = createFormData({
      alias: "my-bucket",
      pathName: "data/",
      displayName: "",
    });

    const response = await action(createActionArgs("POST", formData));

    expect((response as Response).status).toBe(400);
    expect(mockAddPinnedPath).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/pinned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("unpins a path with valid input", async () => {
    mockRemovePinnedPath.mockResolvedValue(undefined);

    const formData = createFormData({
      alias: "my-bucket",
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

  test("returns 400 with missing alias on DELETE", async () => {
    const formData = createFormData({
      alias: "",
      pathName: "data/images/",
    });

    const response = await action(createActionArgs("DELETE", formData));

    expect((response as Response).status).toBe(400);
    expect(mockRemovePinnedPath).not.toHaveBeenCalled();
  });
});

describe("unsupported methods", () => {
  test("returns 405 for PATCH method", async () => {
    const formData = createFormData({
      alias: "my-bucket",
      pathName: "data/",
    });

    const response = await action(createActionArgs("PATCH", formData));

    expect((response as Response).status).toBe(405);
  });
});
