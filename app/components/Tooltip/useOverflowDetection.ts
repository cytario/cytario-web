import { RefObject, useLayoutEffect, useState } from "react";

/**
 * Detects whether an element's content overflows its visible width.
 * Uses ResizeObserver to recheck on any container size change
 * (column resize, flex layout shifts, not just window resize).
 */
export function useOverflowDetection(ref: RefObject<HTMLElement | null>): boolean {
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => setIsTruncated(el.scrollWidth > el.offsetWidth);

    check();

    // Defer + coalesce to the next frame so a live container resize (e.g.
    // dragging a sidebar) can't drive a synchronous observe→setState→layout
    // loop ("Maximum update depth").
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ref]);

  return isTruncated;
}
