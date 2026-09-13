import type { ParquetColumn } from "~/components/DataGrid/getParquetSchema";

/**
 * Interpretation mode for one overlay classification column.
 * "continuous" is reserved for intensity-gradient coloring (follow-up work).
 */
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

export interface OverlayConfig {
  version: 1;
  columns: OverlayColumnsConfig;
  classes: OverlayClassConfig[];
}

export const OVERLAY_CLASS_BIT_LIMIT = 32;

export const MARKER_POSITIVE_PREFIX = "marker_positive_";

const ID_COLUMN_NAMES = ["object", "id", "cell_id", "label"];
const GEOMETRY_COLUMN_NAMES = ["geom", "geometry", "polygon", "wkt", "boundary"];
const X_COLUMN_NAMES = ["x", "x_min", "xmin", "center_x", "centroid_x"];
const Y_COLUMN_NAMES = ["y", "y_min", "ymin", "center_y", "centroid_y"];

const isNumericType = (type: string): boolean =>
  /^(U?INT(8|16|32|64)?|FLOAT|DOUBLE|DECIMAL.*)$/.test(type.toUpperCase());

const isBooleanType = (type: string): boolean => type.toUpperCase() === "BOOLEAN";

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
  /^(U?INT(8|16|32|64)?|VARCHAR|UTF8|STRING|BLOB|BYTE_ARRAY)$/.test(type.toUpperCase());

const isGeometryLikeType = (type: string): boolean =>
  /^(VARCHAR|UTF8|STRING|BLOB|BYTE_ARRAY)$/.test(type.toUpperCase());

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
 * candidates. Returns null when no viable mapping exists.
 */
export function interpretOverlaySchema(schema: ParquetColumn[]): OverlayConfig | null {
  if (schema.length === 0) return null;

  const idColumn = findColumn(schema, ID_COLUMN_NAMES, isIdLikeType);
  const geomColumn = findColumn(schema, GEOMETRY_COLUMN_NAMES, isGeometryLikeType);
  const xColumn = findColumn(schema, X_COLUMN_NAMES, isNumericType);
  const yColumn = findColumn(schema, Y_COLUMN_NAMES, isNumericType);
  if (!idColumn || !xColumn || !yColumn) return null;

  const structuralColumns = new Set(
    [idColumn.name, geomColumn?.name, xColumn.name, yColumn.name].filter(Boolean) as string[],
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
      x: xColumn.name,
      y: yColumn.name,
    },
    classes: classes.slice(0, OVERLAY_CLASS_BIT_LIMIT),
  };
}

/**
 * Validate that every config column exists in the schema with a compatible
 * type. Class threshold mode requires a numeric source column; boolean mode
 * accepts any column (DuckDB casts). Continuous mode is not implemented yet
 * and is rejected.
 */
export function validateOverlayConfig(config: OverlayConfig, schema: ParquetColumn[]): boolean {
  const byName = new Map(schema.map((col) => [col.name, col]));

  const idColumn = byName.get(config.columns.id);
  const xColumn = byName.get(config.columns.x);
  const yColumn = byName.get(config.columns.y);
  if (!idColumn || !isIdLikeType(idColumn.type)) return false;
  if (!xColumn || !isNumericType(xColumn.type)) return false;
  if (!yColumn || !isNumericType(yColumn.type)) return false;
  if (config.columns.geometry) {
    const geomColumn = byName.get(config.columns.geometry);
    if (!geomColumn || !isGeometryLikeType(geomColumn.type)) return false;
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
