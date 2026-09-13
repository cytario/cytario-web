import { interpretOverlaySchema, type OverlayConfig } from "./overlayConfig";
import {
  type ParquetColumn,
  getParquetTopLevelSchema,
} from "~/components/DataGrid/getParquetSchema";

export interface OverlaySchemaInfo {
  schema: ParquetColumn[];
  config: OverlayConfig | null;
}

/**
 * Introspect an overlay parquet's columns, then interpret them into an overlay
 * config. `config` is null when the schema admits no viable mapping — the
 * caller surfaces the configure-overlay path. Struct-intact top-level columns
 * so a GeoParquet covering resolves to its `bbox.xmin` access path.
 */
export async function getOverlaySchema(resourceId: string): Promise<OverlaySchemaInfo> {
  const schema = await getParquetTopLevelSchema(resourceId);
  return { schema, config: interpretOverlaySchema(schema) };
}
