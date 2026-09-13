import { interpretOverlaySchema, type OverlayConfig } from "./overlayConfig";
import { type ParquetColumn, getParquetSchema } from "~/components/DataGrid/getParquetSchema";

export interface OverlaySchemaInfo {
  schema: ParquetColumn[];
  config: OverlayConfig | null;
}

/**
 * Introspect an overlay parquet's columns, then interpret them into an overlay
 * config. `config` is null when the schema admits no viable mapping — the
 * caller surfaces the configure-overlay path.
 */
export async function getOverlaySchema(resourceId: string): Promise<OverlaySchemaInfo> {
  const schema = await getParquetSchema(resourceId);
  return { schema, config: interpretOverlaySchema(schema) };
}
