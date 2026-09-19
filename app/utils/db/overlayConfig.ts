import type { ParquetColumn } from "~/components/DataGrid/getParquetSchema";

/** Interpretation mode for one overlay classification column. */
export type OverlayClassMode = "boolean" | "threshold" | "continuous";

export const OVERLAY_CLASS_OPERATORS = [">", ">=", "<", "<=", "=", "!="] as const;
export type OverlayClassOperator = (typeof OVERLAY_CLASS_OPERATORS)[number];

export interface OverlayClassConfig {
  sourceColumn: string;
  label: string;
  mode: OverlayClassMode;
  operator?: OverlayClassOperator;
  threshold?: number;
}

export interface OverlayColumnsConfig {
  id: string;
  geometry: string;
  x: string;
  y: string;
}

/** How the geometry column stores shapes — BYTE_ARRAY/BLOB holds WKB bytes,
 * VARCHAR/WKT-style text columns hold WKT strings. */
export type OverlayGeometryEncoding = "wkb" | "wkt";

/** Column names of a per-row geometry bounding box (GeoParquet 1.1 covering).
 * Tile filtering runs against these so parquet row-group statistics prune the
 * scan — a spatial predicate on the geometry column itself cannot prune. */
export interface OverlayCoveringColumns {
  xmin: string;
  xmax: string;
  ymin: string;
  ymax: string;
}

/** A geometry-anchored overlay: no x/y columns; position derives from the
 * geometry via its covering. Present only on covering-backed configs. */
export interface OverlayGeometryAnchor {
  encoding: OverlayGeometryEncoding;
  covering: OverlayCoveringColumns;
}

export interface OverlayConfig {
  version: 1;
  columns: OverlayColumnsConfig;
  /** Geometry-anchored configs set this instead of carrying x/y columns. */
  anchor?: OverlayGeometryAnchor;
  classes: OverlayClassConfig[];
}

export const OVERLAY_CLASS_BIT_LIMIT = 32;

export const MARKER_POSITIVE_PREFIX = "marker_positive_";

const ID_COLUMN_NAMES = ["object", "id", "cell_id", "label"];
const GEOMETRY_COLUMN_NAMES = ["geom", "geometry", "polygon", "wkt", "boundary"];
const X_COLUMN_NAMES = ["x", "x_min", "xmin", "center_x", "centroid_x"];
const Y_COLUMN_NAMES = ["y", "y_min", "ymin", "center_y", "centroid_y"];

/** Covering column names tried in order — struct-subfield access is spelled
 * `bbox.xmin` in SQL, so struct coverings store the dotted path. */
const COVERING_STRUCT_COLUMNS: OverlayCoveringColumns = {
  xmin: "bbox.xmin",
  xmax: "bbox.xmax",
  ymin: "bbox.ymin",
  ymax: "bbox.ymax",
};
const COVERING_FLAT_COLUMNS: [keyof OverlayCoveringColumns, string[]][] = [
  ["xmin", ["xmin", "x_min", "minx"]],
  ["xmax", ["xmax", "x_max", "maxx"]],
  ["ymin", ["ymin", "y_min", "miny"]],
  ["ymax", ["ymax", "y_max", "maxy"]],
];

// Types as either parquet_schema (INT32, BYTE_ARRAY, …) or DESCRIBE
// (INTEGER, BIGINT, BLOB, …) spells them.
const isIntegerType = (type: string): boolean =>
  /^(U?INT(8|16|32|64)?|BIGINT|SMALLINT|TINYINT|INTEGER|HUGEINT)$/.test(type.toUpperCase());
const isNumericType = (type: string): boolean =>
  isIntegerType(type) || /^(FLOAT|DOUBLE|REAL|DECIMAL.*)$/.test(type.toUpperCase());

const isBooleanType = (type: string): boolean => /^BOOL(EAN)?$/.test(type.toUpperCase());

const findColumn = (
  columns: ParquetColumn[],
  names: string[],
  typePredicate?: (type: string) => boolean,
): ParquetColumn | undefined =>
  columns.find(
    (col) =>
      names.includes(col.name.toLowerCase()) && (typePredicate ? typePredicate(col.type) : true),
  ) ?? columns.find((col) => names.includes(col.name.toLowerCase()) && typePredicate?.(col.type));

const isIdLikeType = (type: string): boolean =>
  isIntegerType(type) || /^(VARCHAR|UTF8|STRING|BLOB|BYTE_ARRAY)$/.test(type.toUpperCase());

const isGeometryLikeType = (type: string): boolean =>
  /^(VARCHAR|UTF8|STRING|BLOB|BYTE_ARRAY)$/.test(type.toUpperCase());

const isWkbType = (type: string): boolean => /^(BLOB|BYTE_ARRAY)$/.test(type.toUpperCase());

/**
 * Resolve a prunable covering from the schema: struct coverings surface as
 * four struct subfields, flat coverings as four numeric columns matching
 * xmin/xmax/ymin/ymax-like names.
 */
export function findCoveringColumns(schema: ParquetColumn[]): OverlayCoveringColumns | null {
  const byName = new Map(schema.map((col) => [col.name.toLowerCase(), col]));
  const bboxStruct = byName.get("bbox");
  if (bboxStruct && isStructType(bboxStruct.type)) return { ...COVERING_STRUCT_COLUMNS };

  const flat: Partial<OverlayCoveringColumns> = {};
  for (const [key, names] of COVERING_FLAT_COLUMNS) {
    for (const name of names) {
      const col = byName.get(name);
      if (col && isNumericType(col.type)) {
        flat[key] = col.name;
        break;
      }
    }
  }
  if (flat.xmin && flat.xmax && flat.ymin && flat.ymax) {
    return flat as OverlayCoveringColumns;
  }
  return null;
}

const isStructType = (type: string): boolean => /^STRUCT\s*\(/i.test(type.trim());

const labelFromColumnName = (name: string): string =>
  name.startsWith(MARKER_POSITIVE_PREFIX) ? name.slice(MARKER_POSITIVE_PREFIX.length) : name;

const booleanClassConfig = ({ name }: ParquetColumn): OverlayClassConfig => ({
  sourceColumn: name,
  label: labelFromColumnName(name),
  mode: "boolean",
});

const thresholdClassConfig = ({ name }: ParquetColumn): OverlayClassConfig => ({
  sourceColumn: name,
  label: labelFromColumnName(name),
  mode: "threshold",
  operator: ">",
  threshold: 0,
});

/**
 * Automatically derive an overlay column mapping from a parquet schema.
 * Canonical layout (marker_positive_* booleans) wins; otherwise boolean-typed
 * columns become boolean classes and remaining numeric columns become threshold
 * candidates. Geometry-anchored files (no x/y; position encoded in the
 * geometry column) resolve their anchor when a covering exists. Returns null
 * when no viable mapping exists.
 */
export function interpretOverlaySchema(schema: ParquetColumn[]): OverlayConfig | null {
  if (schema.length === 0) return null;

  const idColumn = findColumn(schema, ID_COLUMN_NAMES, isIdLikeType);
  const geomColumn = findColumn(schema, GEOMETRY_COLUMN_NAMES, isGeometryLikeType);
  if (!idColumn) return null;

  // The covering is resolved first: a covering column cannot double as an x/y
  // position column, and files whose only x/y-like names are covering columns
  // are geometry-anchored, not column-position layouts.
  const covering = geomColumn ? findCoveringColumns(schema) : null;
  const coveringNames = new Set(
    covering ? Object.values(covering).map((path) => path.split(".")[0]) : [],
  );
  const nonCoveringColumns = schema.filter((col) => !coveringNames.has(col.name));

  const xColumn = findColumn(nonCoveringColumns, X_COLUMN_NAMES, isNumericType);
  const yColumn = findColumn(nonCoveringColumns, Y_COLUMN_NAMES, isNumericType);

  // Geometry-anchored layout: no x/y columns, but geometry + a covering to
  // filter tiles on. Without a covering the geometry column cannot be pruned
  // at read time.
  let anchor: OverlayGeometryAnchor | undefined;
  if (!xColumn || !yColumn) {
    if (!geomColumn || !covering) return null;
    anchor = {
      encoding: isWkbType(geomColumn.type) ? "wkb" : "wkt",
      covering,
    };
  }

  const structuralColumns = new Set(
    [
      idColumn.name,
      geomColumn?.name,
      xColumn?.name,
      yColumn?.name,
      ...(anchor ? Object.values(anchor.covering).map((path) => path.split(".")[0]) : []),
    ].filter(Boolean) as string[],
  );

  const markerColumns = schema.filter((col) => col.name.startsWith(MARKER_POSITIVE_PREFIX));
  const classes: OverlayClassConfig[] = markerColumns.length
    ? markerColumns.map(booleanClassConfig)
    : schema
        .filter(
          (col) =>
            !structuralColumns.has(col.name) &&
            (isBooleanType(col.type) || isNumericType(col.type)),
        )
        .map((col) =>
          isBooleanType(col.type) ? booleanClassConfig(col) : thresholdClassConfig(col),
        );

  if (classes.length === 0) return null;

  return {
    version: 1,
    columns: {
      id: idColumn.name,
      geometry: geomColumn?.name ?? "",
      x: xColumn?.name ?? "",
      y: yColumn?.name ?? "",
    },
    ...(anchor ? { anchor } : {}),
    classes: classes.slice(0, OVERLAY_CLASS_BIT_LIMIT),
  };
}

/**
 * Validate that every config column exists in the schema with a compatible
 * type. Class threshold mode requires a numeric source column; boolean mode
 * accepts any column (DuckDB casts). Geometry-anchored configs validate the
 * anchor instead of x/y columns.
 */
export function validateOverlayConfig(config: OverlayConfig, schema: ParquetColumn[]): boolean {
  const byName = new Map(schema.map((col) => [col.name, col]));

  const idColumn = byName.get(config.columns.id);
  if (!idColumn || !isIdLikeType(idColumn.type)) return false;

  if (config.anchor) {
    const geomColumn = byName.get(config.columns.geometry);
    if (!config.columns.geometry || !geomColumn || !isGeometryLikeType(geomColumn.type)) {
      return false;
    }
    const coveringValues = Object.values(config.anchor.covering);
    const coveringStruct = coveringValues.every((path) => path.includes("."));
    if (coveringStruct) {
      const bbox = byName.get(coveringValues[0].split(".")[0]);
      if (!bbox || !isStructType(bbox.type)) return false;
    } else {
      const everyCoveringExists = coveringValues.every((name) => {
        const col = byName.get(name);
        return col && isNumericType(col.type);
      });
      if (!everyCoveringExists) return false;
    }
  } else {
    const xColumn = byName.get(config.columns.x);
    const yColumn = byName.get(config.columns.y);
    if (!xColumn || !isNumericType(xColumn.type)) return false;
    if (!yColumn || !isNumericType(yColumn.type)) return false;
    if (config.columns.geometry) {
      const geomColumn = byName.get(config.columns.geometry);
      if (!geomColumn || !isGeometryLikeType(geomColumn.type)) return false;
    }
  }

  return config.classes.every((cls) => {
    const source = byName.get(cls.sourceColumn);
    if (!source) return false;
    if (cls.mode === "continuous") return false;
    if (cls.mode === "threshold") {
      if (!isNumericType(source.type)) return false;
      if (cls.threshold === undefined || !OVERLAY_CLASS_OPERATORS.includes(cls.operator ?? ">")) {
        return false;
      }
    }
    return true;
  });
}

/** Stable key for a config — keys the tile cache and error-suppression sets. */
export function overlayConfigHash(config: OverlayConfig | null | undefined): string {
  if (!config) return "none";
  return JSON.stringify([config.columns, config.classes]);
}
