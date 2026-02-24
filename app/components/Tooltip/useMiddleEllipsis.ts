import { RefObject, useLayoutEffect, useState } from "react";

const ELLIPSIS = "\u2026";

/**
 * Binary-search for the longest `start…end` that fits within the element.
 * Uses actual DOM measurement (scrollWidth vs clientWidth) instead of canvas,
 * so results are pixel-perfect regardless of font, letter-spacing, or rendering.
 */
function computeTruncated(el: HTMLElement, text: string): string {
  el.textContent = text;
  if (el.scrollWidth <= el.clientWidth) return text;

  let lo = 0;
  let hi = text.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const startLen = Math.ceil(mid / 2);
    const endLen = Math.floor(mid / 2);
    el.textContent =
      text.slice(0, startLen) +
      ELLIPSIS +
      (endLen > 0 ? text.slice(text.length - endLen) : "");

    if (el.scrollWidth <= el.clientWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  if (lo === 0) return ELLIPSIS;

  const startLen = Math.ceil(lo / 2);
  const endLen = Math.floor(lo / 2);

  const result =
    endLen === 0
      ? text.slice(0, startLen) + ELLIPSIS
      : text.slice(0, startLen) + ELLIPSIS + text.slice(text.length - endLen);

  // Ensure the DOM shows the final result immediately, before React re-renders.
  el.textContent = result;
  return result;
}

/**
 * Observes the container width and returns a middle-truncated string.
 * Returns the original text if it fits within the container.
 */
export function useMiddleEllipsis(
  ref: RefObject<HTMLSpanElement | null>,
  text: string,
): string {
  const [displayed, setDisplayed] = useState(text);

  // useLayoutEffect runs before paint, so the user never sees the full text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setDisplayed(computeTruncated(el, text));

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, text]);

  return displayed;
}
