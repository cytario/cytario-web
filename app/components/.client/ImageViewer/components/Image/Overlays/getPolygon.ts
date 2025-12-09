import { AccessorContext } from "@deck.gl/core";
import { parseSync } from "@loaders.gl/core";
import { WKBLoader } from "@loaders.gl/wkt";
import { type Table } from "apache-arrow";

export const getPolygon = (arrowTable: Table) => {
  // Polygon mode - parse WKB geometry and use SolidPolygonLayer
  const geomCol = arrowTable.getChild("geom")!;

  return (_d: unknown, { index }: AccessorContext<unknown>) => {
    // Parse WKB binary geometry
    const wkbBuffer = geomCol.get(index);
    const geometry = parseSync(wkbBuffer, WKBLoader);

    // Type guard: check if it's a BinaryPolygonGeometry
    if (!("positions" in geometry)) {
      console.error("Unexpected geometry type:", geometry);
      return [[]];
    }

    // Convert flat Float64Array to nested coordinate array
    // SolidPolygonLayer expects: [[[x1, y1], [x2, y2], ...]]
    const positions = geometry.positions.value;
    const coords: [number, number][] = [];
    for (let i = 0; i < positions.length; i += 2) {
      coords.push([positions[i], positions[i + 1]]);
    }
    return [coords]; // Wrap in array for simple polygon
  };
};
