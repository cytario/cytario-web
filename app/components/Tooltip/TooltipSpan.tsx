import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Tooltip } from "./Tooltip";

export const TooltipSpan = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    if (ref.current) {
      setIsTruncated(ref.current.scrollWidth > ref.current.offsetWidth);
    }
  }, []);

  useLayoutEffect(checkTruncation, [checkTruncation]);

  useEffect(() => {
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [checkTruncation]);

  return (
    <Tooltip content={isTruncated ? children : null}>
      <span
        ref={ref}
        className="truncate overflow-hidden whitespace-nowrap block min-w-0 w-full"
      >
        {children}
      </span>
    </Tooltip>
  );
};
