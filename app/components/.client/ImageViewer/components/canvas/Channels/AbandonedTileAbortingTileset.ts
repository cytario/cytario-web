import { _Tileset2D as Tileset2D } from "@deck.gl/geo-layers";

type UpdateParameters = Parameters<Tileset2D["update"]>;

/**
 * Aborts every in-flight tile the viewport no longer selects or shows.
 *
 * deck.gl only aborts such tiles while more than `maxRequests` are loading, so
 * up to that many abandoned tiles keep downloading next to the ones the view
 * needs. A cancelled tile reloads if it is needed again.
 */
export class AbandonedTileAbortingTileset extends Tileset2D {
  override update(...parameters: UpdateParameters): number {
    const frameNumber = super.update(...parameters);
    for (const tile of this.tiles) {
      if (tile.isLoading && !tile.isSelected && !tile.isVisible) tile.abort();
    }
    return frameNumber;
  }
}
