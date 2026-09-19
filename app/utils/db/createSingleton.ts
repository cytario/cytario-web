/**
 * Higher-order function wrapping an async function with the singleton pattern:
 * caches promises by key and retries on failure (a rejected promise is evicted).
 */
export function createSingleton<K, V, Args extends unknown[]>(
  initFn: (key: K, ...args: Args) => Promise<V>,
): (key: K, ...args: Args) => Promise<V> {
  const cache = new Map<K, Promise<V>>();

  return async (key: K, ...args: Args) => {
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const promise = (async () => {
      try {
        return await initFn(key, ...args);
      } catch (error) {
        cache.delete(key);
        throw error;
      }
    })();

    cache.set(key, promise);
    return promise;
  };
}
