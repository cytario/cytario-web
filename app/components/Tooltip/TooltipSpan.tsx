import { ReactNode, useRef } from "react";

import { Tooltip } from "./Tooltip";
import { useMiddleEllipsis } from "./useMiddleEllipsis";
import { useOverflowDetection } from "./useOverflowDetection";

type EllipsisMode = "left" | "middle" | "right";

interface TooltipSpanProps {
  children: ReactNode;
  ellipsis?: EllipsisMode;
}

const spanCx = "truncate overflow-hidden whitespace-nowrap block min-w-0 w-full";

// ─── Right (default): pure CSS truncation ───────────────────────────

const RightEllipsis = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isTruncated = useOverflowDetection(ref);

  return (
    <Tooltip content={isTruncated ? children : null}>
      <span ref={ref} className={spanCx}>
        {children}
      </span>
    </Tooltip>
  );
};

// ─── Left: CSS direction trick ──────────────────────────────────────

const LeftEllipsis = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isTruncated = useOverflowDetection(ref);

  return (
    <Tooltip content={isTruncated ? children : null}>
      <span
        ref={ref}
        className={spanCx}
        style={{ direction: "rtl", textAlign: "left" }}
      >
        <bdi>{children}</bdi>
      </span>
    </Tooltip>
  );
};

// ─── Middle: JS-based truncation ────────────────────────────────────

const MiddleEllipsisString = ({ text }: { text: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const displayed = useMiddleEllipsis(ref, text);
  const isTruncated = displayed !== text;

  return (
    <Tooltip content={isTruncated ? text : null}>
      <span
        ref={ref}
        className="overflow-hidden whitespace-nowrap block min-w-0 w-full"
      >
        {displayed}
      </span>
    </Tooltip>
  );
};

// ─── Public component ───────────────────────────────────────────────

export const TooltipSpan = ({
  children,
  ellipsis = "right",
}: TooltipSpanProps) => {
  if (ellipsis === "left") return <LeftEllipsis>{children}</LeftEllipsis>;
  if (ellipsis === "middle" && typeof children === "string")
    return <MiddleEllipsisString text={children} />;
  return <RightEllipsis>{children}</RightEllipsis>;
};
