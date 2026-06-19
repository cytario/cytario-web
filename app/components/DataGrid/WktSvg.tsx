import { parseSync } from "@loaders.gl/core";
import { WKTLoader } from "@loaders.gl/wkt";

import { GeometrySvg, type Point } from "./GeometrySvg";

interface WktSvgProps {
  wkt: string;
  size?: number;
}

/** Parses a WKT polygon string into rings and renders it via `GeometrySvg`. */
export const WktSvg = ({ wkt, size = 48 }: WktSvgProps) => (
  <GeometrySvg rings={parseWkt(wkt)} size={size} />
);

/** Parse WKT string using @loaders.gl/wkt and extract coordinate rings. */
function parseWkt(wkt: string): Point[][] {
  try {
    const geometry = parseSync(wkt, WKTLoader);

    if (!geometry || !("coordinates" in geometry)) {
      return [];
    }

    const coords = geometry.coordinates as number[][][] | number[][][][];

    if (geometry.type === "Polygon") {
      // Polygon: [[[x, y], [x, y], ...]]
      return (coords as number[][][]).map((ring) => ring.map(([x, y]) => ({ x, y })));
    }

    if (geometry.type === "MultiPolygon") {
      // MultiPolygon: [[[[x, y], ...]], [[[x, y], ...]]]
      return (coords as number[][][][]).flatMap((polygon) =>
        polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))),
      );
    }

    return [];
  } catch {
    return [];
  }
}
