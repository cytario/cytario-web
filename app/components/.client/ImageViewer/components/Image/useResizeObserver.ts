import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}

export const useResizeObserver = (
  ref: React.RefObject<HTMLElement>,
  resetOnResize: boolean
) => {
  const [viewPort, setViewPort] = useState({ width: 0, height: 0 });
  const debouncedViewPort = useDebouncedValue(viewPort, 100);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewPort({ width, height });
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, resetOnResize, setViewPort]);

  return debouncedViewPort;
};
