import { _Tileset2D as Tileset2D } from "@deck.gl/geo-layers";

import { AbandonedTileAbortingTileset } from "../AbandonedTileAbortingTileset";

interface FakeTile {
  isLoading: boolean;
  isSelected: boolean;
  isVisible: boolean;
  abort: ReturnType<typeof vi.fn>;
}

const fakeTile = (state: Omit<FakeTile, "abort">): FakeTile => ({ ...state, abort: vi.fn() });

const tilesetWith = (tiles: FakeTile[]) => {
  const tileset = new AbandonedTileAbortingTileset({
    getTileData: () => null,
  } as unknown as ConstructorParameters<typeof Tileset2D>[0]);
  Object.defineProperty(tileset, "tiles", { get: () => tiles });
  return tileset;
};

const update = (tileset: AbandonedTileAbortingTileset) =>
  tileset.update({} as Parameters<Tileset2D["update"]>[0]);

describe("AbandonedTileAbortingTileset", () => {
  beforeEach(() => {
    vi.spyOn(Tileset2D.prototype, "update").mockReturnValue(7);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("aborts an in-flight tile the viewport neither selects nor shows", () => {
    const abandoned = fakeTile({ isLoading: true, isSelected: false, isVisible: false });

    update(tilesetWith([abandoned]));

    expect(abandoned.abort).toHaveBeenCalledTimes(1);
  });

  test("keeps loading the tiles the view selects or shows as placeholders", () => {
    const selected = fakeTile({ isLoading: true, isSelected: true, isVisible: true });
    const placeholder = fakeTile({ isLoading: true, isSelected: false, isVisible: true });

    update(tilesetWith([selected, placeholder]));

    expect(selected.abort).not.toHaveBeenCalled();
    expect(placeholder.abort).not.toHaveBeenCalled();
  });

  test("leaves tiles that are not loading alone", () => {
    const settled = fakeTile({ isLoading: false, isSelected: false, isVisible: false });

    update(tilesetWith([settled]));

    expect(settled.abort).not.toHaveBeenCalled();
  });

  test("aborts regardless of how few requests are in flight", () => {
    const tiles = [
      fakeTile({ isLoading: true, isSelected: true, isVisible: true }),
      fakeTile({ isLoading: true, isSelected: false, isVisible: false }),
    ];

    update(tilesetWith(tiles));

    expect(tiles[1].abort).toHaveBeenCalledTimes(1);
  });

  test("returns deck.gl's frame number", () => {
    expect(update(tilesetWith([]))).toBe(7);
  });
});
