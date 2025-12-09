type FileType = "parquet" | "csv" | "json";

/**
 * Detect file type from path extension
 */
export function getFileType(path: string): FileType {
  const lower = path.toLowerCase();
  if (lower.endsWith(".parquet")) return "parquet";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json") || lower.endsWith(".ndjson")) return "json";
  // Default to parquet for unknown extensions
  return "parquet";
}

/**
 * Get DuckDB read function for file type
 */
export function getReadFunction(fileType: FileType, s3Path: string): string {
  switch (fileType) {
    case "parquet":
      return `read_parquet('${s3Path}')`;
    case "csv":
      return `read_csv_auto('${s3Path}', comment = '#')`;
    case "json":
      return `read_json_auto('${s3Path}')`;
  }
}
