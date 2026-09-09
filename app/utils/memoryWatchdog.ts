import { trimCaches } from "./db/cacheTrim";

/** Chromium-only heap stats; absent on Firefox/Safari where the watchdog no-ops. */
interface MemoryInfo {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

declare global {
  interface Performance {
    memory?: MemoryInfo;
  }
}

const POLL_INTERVAL_MS = 10_000;
/** Warn once the heap crosses this fraction of the renderer's limit. */
const WARN_THRESHOLD = 0.8;

export interface MemoryWatchdogOptions {
  /** Injected for tests; defaults to the ambient performance.memory. */
  getMemoryInfo?: () => MemoryInfo | undefined;
  /** Toast + trim side effects; injected for tests. */
  onPressure?: () => void;
  /** Poll scheduler; injected for tests. */
  schedule?: (callback: () => void, intervalMs: number) => () => void;
  /** Warn threshold override for tests. */
  warnThreshold?: number;
}

interface WatchdogState {
  armed: boolean;
  confirmed: boolean;
  notified: boolean;
}

/** Ratio of used heap to the renderer limit, or null when unavailable. */
export const memoryPressureRatio = (info: MemoryInfo): number | null => {
  if (info.jsHeapSizeLimit <= 0) return null;
  return info.usedJSHeapSize / info.jsHeapSizeLimit;
};

const defaultSchedule = (callback: () => void, intervalMs: number) => {
  const id = setInterval(callback, intervalMs);
  return () => clearInterval(id);
};

/**
 * Client-side memory-pressure safeguard: polls Chromium heap stats and reacts
 * with a toast + cache trim before the renderer is OOM-killed (which no JS
 * survives). Idempotent; a silent no-op where performance.memory is absent.
 */
export function startMemoryWatchdog(options: MemoryWatchdogOptions = {}): () => void {
  const getMemoryInfo = options.getMemoryInfo ?? (() => performance.memory);
  const onPressure = options.onPressure ?? (() => void trimCaches());
  const schedule = options.schedule ?? defaultSchedule;
  const warnThreshold = options.warnThreshold ?? WARN_THRESHOLD;

  const state: WatchdogState = { armed: true, confirmed: false, notified: false };

  const tick = () => {
    if (!state.armed) return;

    const info = getMemoryInfo();
    if (!info) return;

    const ratio = memoryPressureRatio(info);
    if (ratio !== null && ratio >= warnThreshold) {
      // Two consecutive hot samples before acting — a single GC spike must not
      // trigger a trim storm.
      if (state.confirmed) {
        if (!state.notified) {
          state.notified = true;
          onPressure();
        }
      } else {
        state.confirmed = true;
      }
    } else {
      state.confirmed = false;
      state.notified = false;
    }
  };

  const cancel = schedule(tick, POLL_INTERVAL_MS);
  return () => {
    state.armed = false;
    cancel();
  };
}
