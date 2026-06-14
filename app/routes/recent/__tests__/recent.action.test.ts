import { beforeEach, describe, expect, test, vi } from "vitest";

const mockRecordRecentlyViewed = vi.hoisted(() => vi.fn());
const mockClearRecentlyViewed = vi.hoisted(() => vi.fn());

vi.mock("../recordRecentlyViewed.action", () => ({
  recordRecentlyViewed: mockRecordRecentlyViewed,
}));

vi.mock("../clearRecentlyViewed.action", () => ({
  clearRecentlyViewed: mockClearRecentlyViewed,
}));

import { action } from "../recent.route";

function createArgs(method: string) {
  return {
    request: new Request("http://localhost/recent", { method }),
    context: { get: vi.fn() },
    params: {},
  } as unknown as Parameters<typeof action>[0];
}

describe("recent route action dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("POST dispatches to recordRecentlyViewed", async () => {
    mockRecordRecentlyViewed.mockResolvedValue(Response.json({ ok: true }));
    await action(createArgs("POST"));
    expect(mockRecordRecentlyViewed).toHaveBeenCalledOnce();
  });

  test("DELETE dispatches to clearRecentlyViewed", async () => {
    mockClearRecentlyViewed.mockResolvedValue({ ok: true });
    await action(createArgs("DELETE"));
    expect(mockClearRecentlyViewed).toHaveBeenCalledOnce();
  });

  test("returns 405 for unsupported method", async () => {
    const response = await action(createArgs("PATCH"));
    expect((response as Response).status).toBe(405);
    expect(mockRecordRecentlyViewed).not.toHaveBeenCalled();
    expect(mockClearRecentlyViewed).not.toHaveBeenCalled();
  });
});
