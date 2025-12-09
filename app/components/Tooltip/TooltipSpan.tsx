import { ReactNode, useLayoutEffect, useRef, useState } from "react";

import { Tooltip } from "./Tooltip";

export const TooltipSpan = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [needsToolstip, setNeedsTooltip] = useState(false);

  useLayoutEffect(() => {
    if (ref.current) {
      setNeedsTooltip(ref.current.scrollWidth > ref.current.offsetWidth);
    }
  }, []);

  const span = (
    <span
      ref={ref}
      className="truncate overflow-hidden whitespace-nowrap block min-w-0"
    >
      {children}
    </span>
  );

  if (needsToolstip) {
    return <Tooltip content={children}>{span}</Tooltip>;
  }

  return span;
};
