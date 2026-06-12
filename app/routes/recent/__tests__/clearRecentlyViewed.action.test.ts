import { beforeEach, describe, expect, test, vi } from "vitest";

const mockClearAllRecentlyViewed = vi.hoisted(() => vi.fn());

vi.mock("../recent.server", () => ({
  clearAllRecentlyViewed: mockClearAllRecentlyViewed,
}));

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {
    get: vi.fn(),
  },
  authMiddleware: vi.fn(),
}));

import { clearRecentlyViewed } from "../clearRecentlyViewed.action";

function createActionArgs() {
  const mockContext = {
    get: vi.fn().mockReturnValue({
      user: { sub: "user-1" },
    }),
  };

  return {
    request: new Request("http://localhost/recent", { method: "DELETE" }),
    context: mockContext,
    params: {},
  } as unknown as Parameters<typeof clearRecentlyViewed>[0];
}

describe("clearRecentlyViewed action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("clears history and returns ok", async () => {
    mockClearAllRecentlyViewed.mockResolvedValue(undefined);

    const result = await clearRecentlyViewed(createActionArgs());

    expect(result).toEqual({ ok: true });
    expect(mockClearAllRecentlyViewed).toHaveBeenCalledWith("user-1");
  });

  test("returns 500 when clear throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockClearAllRecentlyViewed.mockRejectedValue(new Error("DB connection lost"));

    const response = await clearRecentlyViewed(createActionArgs());

    expect((response as Response).status).toBe(500);
    consoleError.mockRestore();
  });
});
