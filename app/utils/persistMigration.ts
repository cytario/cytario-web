/**
 * Creates a versioned migrate function for Zustand persist middleware.
 *
 * Each entry in the migrations record maps a source version number
 * to a function that transforms state from that version to the next.
 * Migrations are applied sequentially: v0 -> v1 -> v2 -> ... -> current.
 *
 * If any migration throws, the fallback state is returned instead
 * of crashing the app with corrupt hydrated state.
 */
export function createMigrate<TState>(
  migrations: Record<number, (state: unknown) => unknown>,
  fallbackState: TState,
): (persistedState: unknown, version: number) => TState {
  return (persistedState: unknown, version: number): TState => {
    try {
      let state = persistedState;
      const targetVersion = Math.max(...Object.keys(migrations).map(Number)) + 1;

      for (let v = version; v < targetVersion; v++) {
        const migration = migrations[v];
        if (migration) {
          state = migration(state);
        }
      }

      return state as TState;
    } catch (error) {
      console.warn("[persist] Migration failed, using fallback state:", error);
      return fallbackState;
    }
  };
}
