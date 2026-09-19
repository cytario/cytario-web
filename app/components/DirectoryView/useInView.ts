import { useEffect, useRef, useState } from "react";

/** Keeps heavy per-card resources (viewer store, deck.gl) unmounted off-screen. */
export function useInView<T extends Element>(
  rootMargin = "200px",
): {
  ref: (node: T | null) => void;
  isInView: boolean;
} {
  const [isInView, setIsInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = (node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), {
      rootMargin,
    });
    observer.observe(node);
    observerRef.current = observer;
  };

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, isInView };
}
