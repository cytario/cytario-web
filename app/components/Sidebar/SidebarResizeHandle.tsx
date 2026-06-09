import { useRef } from "react";

import { useSidebarStore } from "./useSidebarStore";

export function SidebarResizeHandle() {
  const setWidth = useSidebarStore((s) => s.setWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startWidth: useSidebarStore.getState().width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(drag.current.startWidth + (e.clientX - drag.current.startX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize navigation panel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-ew-resize bg-transparent hover:bg-(--color-border-strong) duration-100"
    />
  );
}
