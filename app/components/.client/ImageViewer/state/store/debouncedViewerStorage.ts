import type { StateStorage } from "zustand/middleware";

/**
 * localStorage adapter whose writes are debounced. View-state setters fire on
 * every animation frame during pan/zoom; without debouncing, persist would
 * serialize the full partialized state (including per-channel histograms) to
 * localStorage every frame. Reads/removes pass through synchronously; writes
 * are coalesced on a trailing timer and flushed synchronously when the tab is
 * hidden or unloaded so state survives navigation and tab close.
 */
export const createDebouncedStorage = (delay = 300): StateStorage => {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const [key, value] of pending) {
      window.localStorage.setItem(key, value);
    }
    pending.clear();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
  }

  return {
    getItem: (name) => window.localStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      pending.delete(name);
      window.localStorage.removeItem(name);
    },
  };
};
