/** Quote a DuckDB identifier, escaping embedded double quotes. */
export function escapeSqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
