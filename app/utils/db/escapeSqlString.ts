/** Double every `'` so the value is safe to interpolate in a single-quoted DuckDB literal. */
export function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}
