/**
 * Higher-order function that wraps an async function with singleton pattern.
 * Caches promises by key and automatically retries on failure.
 *
 * @param initFn - Async initialization function to memoize
 * @returns Memoized version that caches by first parameter (key)
 */
export function createSingleton<K, V, Args extends unknown[]>(
  initFn: (key: K, ...args: Args) => Promise<V>
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
