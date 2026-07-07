import { parseSync } from "@loaders.gl/core";
import { WKTLoader } from "@loaders.gl/wkt";
import type { Geometry } from "geojson";

/** Parse a WKT string into a GeoJSON geometry; null on empty/invalid input. */
export function wktToGeometry(wkt: string): Geometry | null {
  try {
    const geometry = parseSync(wkt, WKTLoader);
    return geometry && "type" in geometry ? (geometry as Geometry) : null;
  } catch {
    return null;
  }
}
