import { IconButton } from "@cytario/design";
import { useLayoutEffect, useRef } from "react";

const POPUP_OFFSET = 12;
const VIEWPORT_MARGIN = 4;

interface PopupCardProps {
  /** Panel-relative anchor (where the click happened). */
  anchor: { x: number; y: number };
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

/** Clamp an anchor-based popup position to the nearest positioned parent. */
export const anchoredPopupPosition = (
  width: number,
  height: number,
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } => {
  let x = anchor.x + POPUP_OFFSET;
  let y = anchor.y + POPUP_OFFSET;
  if (anchor.x + width > viewport.width) x = anchor.x - width - POPUP_OFFSET;
  if (anchor.y + height > viewport.height) y = anchor.y - height - POPUP_OFFSET;
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, viewport.width - width - VIEWPORT_MARGIN)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, viewport.height - height - VIEWPORT_MARGIN)),
  };
};

/** Chrome of the click popup: cursor-anchored, clamped, non-modal dialog with
 *  a header + close affordance and focus-in. The content is composed by the
 *  caller (live sidebar components) — this card deliberately knows nothing
 *  about tooltip items. */
export function PopupCard({ anchor, onClose, label, children }: PopupCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Non-modal dialog: take focus so Escape and screen readers work without a
  // focus trap (the sidebar stays usable).
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;

    const { width, height } = el.getBoundingClientRect();
    const { x, y } = anchoredPopupPosition(width, height, anchor, {
      width: parent.clientWidth,
      height: parent.clientHeight,
    });
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [anchor]);

  const cx = `
    absolute z-50
    w-60
    rounded-sm shadow-lg
    bg-background/80 backdrop-blur-sm text-foreground
    border border-border
    text-sm
    overflow-hidden
    outline-none
  `;

  return (
    <div
      ref={ref}
      className={cx}
      style={{ left: anchor.x + POPUP_OFFSET, top: anchor.y + POPUP_OFFSET }}
      data-image-popup
      role="dialog"
      aria-modal={false}
      aria-label={label}
      tabIndex={-1}
    >
      <div className="flex items-center justify-between bg-background px-2 py-1 border-b border-border">
        <span className="text-xs text-muted-foreground">Image details</span>
        <IconButton icon="X" label="Close popup" size="xs" variant="ghost" onPress={onClose} />
      </div>
      {children}
    </div>
  );
}
