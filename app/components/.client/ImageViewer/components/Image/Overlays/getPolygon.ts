import { AccessorContext } from "@deck.gl/core";
import { parseSync } from "@loaders.gl/core";
import { WKBLoader } from "@loaders.gl/wkt";
import { type Table } from "apache-arrow";

type Ring = [number, number][];

type PolygonGeometry = { type: "Polygon"; coordinates: Ring[] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Ring[][] };

const isPolygon = (g: unknown): g is PolygonGeometry =>
  typeof g === "object" && g !== null && (g as { type?: unknown }).type === "Polygon";

const isMultiPolygon = (g: unknown): g is MultiPolygonGeometry =>
  typeof g === "object" && g !== null && (g as { type?: unknown }).type === "MultiPolygon";

// Accessor runs per row per frame; unrated logging would flood the console.
const warned = new Set<string>();
const warnOnce = (key: string, level: "warn" | "error", ...args: unknown[]) => {
  if (warned.has(key)) return;
  warned.add(key);
  console[level](...args);
};

// Fresh empty polygon per call — deck.gl 9.x is read-only on the returned
// value, but cheap insurance against future internal mutation.
const empty = (): Ring[] => [[]];

export const getPolygon = (arrowTable: Table) => {
  const geomCol = arrowTable.getChild("geom")!;

  return (_d: unknown, { index }: AccessorContext<unknown>) => {
    const wkbBuffer = geomCol.get(index);
    if (!wkbBuffer) {
      warnOnce("empty-geom", "warn", "[getPolygon] empty geom column value");
      return empty();
    }

    const geometry: unknown = parseSync(wkbBuffer, WKBLoader);

    if (isPolygon(geometry)) {
      return geometry.coordinates;
    }
    if (isMultiPolygon(geometry)) {
      // SolidPolygonLayer cannot represent disjoint polygons in a single row.
      // Render the first polygon only; preprocess upstream (one row per
      // polygon) for full fidelity.
      warnOnce(
        "multipolygon",
        "warn",
        "[getPolygon] MultiPolygon downgraded to first polygon; preprocess to one row per polygon for full rendering",
      );
      return geometry.coordinates[0] ?? empty();
    }
    warnOnce("unknown-type", "error", "[getPolygon] unexpected geometry type:", geometry);
    return empty();
  };
};
