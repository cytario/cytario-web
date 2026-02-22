/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import { useRef } from "react";
import { twMerge } from "tailwind-merge";

import { useResizeObserver } from "./useResizeObserver";
import { select } from "../../state/selectors";
import { ViewPort } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { LavaLoader } from "~/components/LavaLoader";

interface ViewContainerProps {
  children: (viewPort: ViewPort) => JSX.Element;
  isActivePanel?: boolean;
  isPreview?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function ImageContainer({
  children,
  isActivePanel = false,
  isPreview = false,
  onClick,
  onPointerMove,
  onPointerLeave,
}: ViewContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewPort = useResizeObserver(containerRef, true);
  const isViewerLoading = useViewerStore(select.isViewerLoading);
  const error = useViewerStore(select.error);

  const style = `
    relative flex flex-grow
    w-full h-full 
    overflow-hidden
  `;

  let background = "bg-[var(--color-surface-default)]";
  if (isPreview) background = "bg-black";
  if (error) background = "bg-[var(--color-surface-muted)]";

  let border = "border border-2 border-[var(--color-border-strong)]";
  if (isActivePanel) border += " border-[var(--color-text-secondary)]";
  if (isPreview) border += " border-none";
  if (error) background += " border-none";

  const cx = twMerge(style, background, border);

  const cy = twMerge(
    `
    pointer-events-none w-full h-full 
    absolute top-0 left-0
    border-[16px]
    box-border border-[var(--color-text-secondary)]
  `,
    isActivePanel ? "animate-pulse-once" : "border-none"
  );

  return (
    <>
      <div
        ref={containerRef}
        className={cx}
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {error ? (
          <div
            className={`
          flex flex-grow w-full h-full flex-col
          items-center justify-center text-center
          overflow-hidden
        `}
          >
            <div>{error.name}</div>
            <div>{error.message}</div>
          </div>
        ) : (
          <>
            {isViewerLoading && <LavaLoader />}
            {children(viewPort)}
          </>
        )}
        <div className={cy} />
      </div>
    </>
  );
}
