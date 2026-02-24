import { CSSProperties, KeyboardEvent, ReactNode, useRef } from "react";

import { Tooltip } from "./Tooltip";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useMiddleEllipsis } from "./useMiddleEllipsis";
import { useOverflowDetection } from "./useOverflowDetection";

type EllipsisMode = "left" | "middle" | "right";

interface TooltipSpanProps {
  children: ReactNode;
  ellipsis?: EllipsisMode;
  copyValue?: string;
}

const spanCx = "truncate overflow-hidden whitespace-nowrap block min-w-0 w-full";
const copyCx = "hover:bg-black/10 transition-colors";

const leftStyle: CSSProperties = { direction: "rtl", textAlign: "left" };

const handleCopyKeyDown = (handleClick: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handleClick();
  }
};

const CopiedOverlay = () => (
  <span className="absolute inset-0 flex items-center text-gray-400 text-xs pointer-events-none">
    Copied
  </span>
);

// ─── Right (default): pure CSS truncation ───────────────────────────

const RightEllipsis = ({
  children,
  copyValue,
}: {
  children: ReactNode;
  copyValue?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isTruncated = useOverflowDetection(ref);
  const { handleClick, isCopied } = useCopyToClipboard(copyValue);
  const isCopyable = copyValue != null;

  const baseCx = isCopyable ? `${spanCx} ${copyCx} relative` : spanCx;
  const cx = isCopied ? `${baseCx} text-transparent` : baseCx;

  return (
    <Tooltip content={isTruncated ? children : null}>
      <span
        ref={ref}
        className={cx}
        onClick={isCopyable ? handleClick : undefined}
        onKeyDown={isCopyable ? handleCopyKeyDown(handleClick) : undefined}
        role={isCopyable ? "button" : undefined}
        tabIndex={isCopyable ? 0 : undefined}
      >
        {children}
        {isCopied && <CopiedOverlay />}
      </span>
    </Tooltip>
  );
};

// ─── Left: CSS direction trick ──────────────────────────────────────

const LeftEllipsis = ({
  children,
  copyValue,
}: {
  children: ReactNode;
  copyValue?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isTruncated = useOverflowDetection(ref);
  const { handleClick, isCopied } = useCopyToClipboard(copyValue);
  const isCopyable = copyValue != null;

  const baseCx = isCopyable ? `${spanCx} ${copyCx} relative` : spanCx;
  const cx = isCopied ? `${baseCx} text-transparent` : baseCx;

  return (
    <Tooltip content={isTruncated ? children : null}>
      <span
        ref={ref}
        className={cx}
        style={leftStyle}
        onClick={isCopyable ? handleClick : undefined}
        onKeyDown={isCopyable ? handleCopyKeyDown(handleClick) : undefined}
        role={isCopyable ? "button" : undefined}
        tabIndex={isCopyable ? 0 : undefined}
      >
        <bdi>{children}</bdi>
        {isCopied && <CopiedOverlay />}
      </span>
    </Tooltip>
  );
};

// ─── Middle: JS-based truncation ────────────────────────────────────

const middleCx = "overflow-hidden whitespace-nowrap block min-w-0 w-full";

const MiddleEllipsisString = ({
  text,
  copyValue,
}: {
  text: string;
  copyValue?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const displayed = useMiddleEllipsis(ref, text);
  const isTruncated = displayed !== text;
  const { handleClick, isCopied } = useCopyToClipboard(copyValue);
  const isCopyable = copyValue != null;

  const baseCx = isCopyable ? `${middleCx} ${copyCx} relative` : middleCx;
  const cx = isCopied ? `${baseCx} text-transparent` : baseCx;

  return (
    <Tooltip content={isTruncated ? text : null}>
      <span
        ref={ref}
        className={cx}
        onClick={isCopyable ? handleClick : undefined}
        onKeyDown={isCopyable ? handleCopyKeyDown(handleClick) : undefined}
        role={isCopyable ? "button" : undefined}
        tabIndex={isCopyable ? 0 : undefined}
      >
        {displayed}
        {isCopied && <CopiedOverlay />}
      </span>
    </Tooltip>
  );
};

// ─── Public component ───────────────────────────────────────────────

export const TooltipSpan = ({
  children,
  ellipsis = "right",
  copyValue,
}: TooltipSpanProps) => {
  if (ellipsis === "left")
    return <LeftEllipsis copyValue={copyValue}>{children}</LeftEllipsis>;
  if (ellipsis === "middle" && typeof children === "string")
    return <MiddleEllipsisString text={children} copyValue={copyValue} />;
  return <RightEllipsis copyValue={copyValue}>{children}</RightEllipsis>;
};
