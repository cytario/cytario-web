type Connection = {
  query: (sql: string) => Promise<unknown>;
};

const loaded = new WeakMap<Connection, Promise<void>>();

/**
 * Lazily install + load the DuckDB `spatial` extension. ~23 MB, so kept off
 * `createDatabase`'s critical path. Idempotent per connection via WeakMap.
 */
export function ensureSpatialLoaded<T extends Connection>(connection: T): Promise<void> {
  const cached = loaded.get(connection);
  if (cached) return cached;

  // Evict on rejection so a transient failure does not poison the connection
  // until full reload.
  const promise = (async () => {
    try {
      await connection.query("INSTALL spatial;");
      await connection.query("LOAD spatial;");
    } catch (error) {
      loaded.delete(connection);
      throw error;
    }
  })();
  loaded.set(connection, promise);
  return promise;
}
