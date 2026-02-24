import { RefObject, useLayoutEffect, useState } from "react";

/**
 * Detects whether an element's content overflows its visible width.
 * Uses ResizeObserver to recheck on any container size change
 * (column resize, flex layout shifts, not just window resize).
 */
export function useOverflowDetection(
  ref: RefObject<HTMLElement | null>,
): boolean {
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () =>
      setIsTruncated(el.scrollWidth > el.offsetWidth);

    check();

    const observer = new ResizeObserver(() => check());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return isTruncated;
}
