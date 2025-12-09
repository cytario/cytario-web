import { type BBox } from "geojson";
import { type TileIndex } from "node_modules/@deck.gl/geo-layers/dist/tileset-2d/types";

/**
 * Get tile bounding box in projected coordinates
 */
export function getTileBoundingBox(
  { z, x, y }: TileIndex,
  tileSize: number = 256
): BBox {
  const zoom = z * -1 + 1;
  const projectedTileSize = tileSize * 2 ** zoom;

  const minX = x * projectedTileSize;
  const minY = y * projectedTileSize;
  const maxX = (x + 1) * projectedTileSize;
  const maxY = (y + 1) * projectedTileSize;

  return [minX, minY, maxX, maxY];
}
