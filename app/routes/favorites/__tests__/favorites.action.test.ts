import { beforeEach, describe, expect, test, vi } from "vitest";

const mockAddFavoriteAction = vi.hoisted(() => vi.fn());
const mockRemoveFavoriteAction = vi.hoisted(() => vi.fn());

vi.mock("../addFavorite.action", () => ({
  addFavoriteAction: mockAddFavoriteAction,
}));

vi.mock("../removeFavorite.action", () => ({
  removeFavoriteAction: mockRemoveFavoriteAction,
}));

import { action } from "../favorites.route";

function createArgs(method: string) {
  return {
    request: new Request("http://localhost/favorites", { method }),
    context: { get: vi.fn() },
    params: {},
  } as unknown as Parameters<typeof action>[0];
}

describe("favorites route action dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("PUT dispatches to addFavoriteAction", async () => {
    mockAddFavoriteAction.mockResolvedValue(Response.json({ ok: true }));
    await action(createArgs("PUT"));
    expect(mockAddFavoriteAction).toHaveBeenCalledOnce();
  });

  test("DELETE dispatches to removeFavoriteAction", async () => {
    mockRemoveFavoriteAction.mockResolvedValue(Response.json({ ok: true }));
    await action(createArgs("DELETE"));
    expect(mockRemoveFavoriteAction).toHaveBeenCalledOnce();
  });

  test("returns 405 for unsupported method", async () => {
    const response = await action(createArgs("POST"));
    expect((response as Response).status).toBe(405);
    expect(mockAddFavoriteAction).not.toHaveBeenCalled();
    expect(mockRemoveFavoriteAction).not.toHaveBeenCalled();
  });
});
