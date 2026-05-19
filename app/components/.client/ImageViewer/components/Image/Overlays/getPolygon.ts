import { AccessorContext } from "@deck.gl/core";
import { parseSync } from "@loaders.gl/core";
import { WKBLoader } from "@loaders.gl/wkt";
import { type Table } from "apache-arrow";

type Ring = [number, number][];

export const getPolygon = (arrowTable: Table) => {
  const geomCol = arrowTable.getChild("geom")!;

  return (_d: unknown, { index }: AccessorContext<unknown>) => {
    const wkbBuffer = geomCol.get(index);
    const geometry = parseSync(wkbBuffer, WKBLoader) as
      | { type: "Polygon"; coordinates: Ring[] }
      | { type: "MultiPolygon"; coordinates: Ring[][] };

    if (geometry.type === "Polygon") {
      return geometry.coordinates;
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates[0] ?? [[]];
    }
    console.error("Unexpected geometry type:", geometry);
    return [[]];
  };
};
