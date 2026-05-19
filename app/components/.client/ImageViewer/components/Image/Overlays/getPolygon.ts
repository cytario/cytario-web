import { type AccessorContext, type Position } from "@deck.gl/core";
import { parseSync } from "@loaders.gl/core";
import { WKBLoader } from "@loaders.gl/wkt";
import { type Table } from "apache-arrow";
import { type Geometry } from "geojson";

// Dedup per-row warnings — accessor fires per row per frame.
const warned = new Set<string>();
const warnOnce = (key: string, level: "warn" | "error", ...args: unknown[]) => {
  if (warned.has(key)) return;
  warned.add(key);
  console[level](...args);
};

export const getPolygon = (arrowTable: Table) => {
  const geomCol = arrowTable.getChild("geom")!;

  return (_d: unknown, { index }: AccessorContext<unknown>): Position[][] => {
    const wkbBuffer = geomCol.get(index);
    if (!wkbBuffer) {
      warnOnce("empty-geom", "warn", "[getPolygon] empty geom column value");
      return [[]];
    }

    const geometry = parseSync(wkbBuffer, WKBLoader) as Geometry;

    if (geometry.type === "Polygon") {
      return geometry.coordinates as Position[][];
    }
    if (geometry.type === "MultiPolygon") {
      // SolidPolygonLayer one polygon per row — render first, preprocess upstream for full fidelity.
      warnOnce(
        "multipolygon",
        "warn",
        "[getPolygon] MultiPolygon downgraded to first polygon; preprocess to one row per polygon for full rendering",
      );
      return (geometry.coordinates[0] ?? [[]]) as Position[][];
    }
    warnOnce("unknown-type", "error", "[getPolygon] unexpected geometry type:", geometry);
    return [[]];
  };
};
