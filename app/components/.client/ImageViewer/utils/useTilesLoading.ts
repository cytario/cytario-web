import { useRef, useCallback, useEffect } from "react";

/**
 * Tracks outstanding tile requests per panel and reports the count to the
 * store. A zoom step fires a `loadTile`/`finishTile` pair per tile per channel,
 * so writing to the store on every event made every tile start and finish a
 * full store update — and therefore a serialize (persist) plus an ImagePanel
 * re-render. The count is only cosmetic (the pulsing tile indicator), so the
 * writes are coalesced to at most one per animation frame.
 */
export const useTilesLoading = (
  imagePanelId: number,
  setIsTilesLoading: (imagePanelId: number, count: number) => void,
) => {
  const loadingSet = useRef(new Set<string>());
  const lastReported = useRef(-1);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const size = loadingSet.current.size;
    if (size === lastReported.current) return;
    lastReported.current = size;
    setIsTilesLoading(imagePanelId, size);
  }, [imagePanelId, setIsTilesLoading]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    if (typeof requestAnimationFrame === "function") {
      frame.current = requestAnimationFrame(flush);
    } else {
      frame.current = setTimeout(flush, 0) as unknown as number;
    }
  }, [flush]);

  // Cancel a queued frame on unmount so a torn-down panel can't write after it
  // is gone.
  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        clearTimeout(frame.current as unknown as ReturnType<typeof setTimeout>);
        frame.current = null;
      }
    },
    [],
  );

  const loadTile = useCallback(
    (id: string) => {
      loadingSet.current.add(id);
      schedule();
    },
    [schedule],
  );

  const finishTile = useCallback(
    (id: string) => {
      loadingSet.current.delete(id);
      schedule();
    },
    [schedule],
  );

  return { loadTile, finishTile };
};
