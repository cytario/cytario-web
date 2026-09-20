import { Icon, IconButton } from "@cytario/design";
import { motion, useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { SectionHeaderRow } from "./SectionHeaderRow";
import {
  clampFloatRect,
  FLOAT_KEYBOARD_STEP,
  FLOAT_KEYBOARD_STEP_LARGE,
  FLOAT_PANEL_WIDTH,
  type FloatRect,
} from "~/components/Sidebar/createSidebarStore";
import { FLOATING_PANEL_ATTR, useSectionHandle } from "~/components/Sidebar/SidebarContext";
import { PILLARS, type PillarId } from "~/utils/pillars";

// The panel itself is the scroll container; its header is already sticky.
// Translucency + blur like the drawing FloatingBar (Toolbar) — children in the
// sticky header zone carry their own translucent layer so scrolled content is
// masked underneath; the body stays transparent over the root's blurred bg.
const FLOATING_PANEL_CLASSES =
  "overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-background/80 backdrop-blur-sm shadow-lg";
const TRANSLUCENT_CLASSES = "bg-background/80 backdrop-blur-sm";

/** Pillars whose body reflows to a 3-column SectionGrid when given room. */
const THREE_COLUMN_PILLARS = new Set<PillarId>(["views", "channels", "overlays"]);
/** SectionGrid shows its 3rd column at the @lg container token (--container-lg,
 *  32rem) — but the panel's own chrome (1px borders, classic scrollbars take
 *  inline space) shrinks the measured @container below the token. Spawn wide
 *  pillars one container step above it (--container-xl, 36rem) so the 3-column
 *  reflow is guaranteed. */
const SECTION_GRID_3COL_WIDTH = 36 * 16;
const floatWidth = (pillar: PillarId) =>
  THREE_COLUMN_PILLARS.has(pillar) ? SECTION_GRID_3COL_WIDTH : FLOAT_PANEL_WIDTH;

/** Pointer travel before a header drag detaches a docked section. */
const DETACH_THRESHOLD_PX = 8;
/** Pointer travel before a floating panel's release counts as a dock-drop.
 *  A freshly floated panel spawns over the sidebar slot; without this, any
 *  small grab-and-release of its header re-docks it immediately. */
const DOCK_DROP_MIN_TRAVEL_PX = 16;
/** Where the panel spawns relative to the pointer so the control stays under the cursor. */
const GRAB_OFFSET = { x: 12, y: 8 };
/** Click-float nudge toward the canvas so the panel visibly leaves the sidebar column. */
const SPAWN_X_NUDGE_PX = 8;

interface SectionProps {
  pillar: PillarId;
  badge?: string;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

interface DragGesture {
  wasFloating: boolean;
  /** Drag-out has crossed the threshold and spawned the panel. */
  detached: boolean;
  /** Rect the panel occupies when the motion offsets are 0. */
  baseRect: FloatRect;
  startX: number;
  startY: number;
  /** Last clamped live rect — committed on release. */
  lastRect: FloatRect | null;
}

interface FloatDockButtonProps {
  pillar: PillarId;
  isFloating: boolean;
  onPress: () => void;
  className?: string;
  isDisabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/** Merged float/dock control, shared by the panel header and the sidebar placeholder. */
function FloatDockButton({
  pillar,
  isFloating,
  onPress,
  className,
  isDisabled,
  ref,
}: FloatDockButtonProps) {
  const { title, icon } = PILLARS[pillar];
  return (
    <IconButton
      ref={ref}
      icon={icon}
      label={`${isFloating ? "Dock" : "Float"} ${title}`}
      size="xs"
      isDisabled={isDisabled}
      className={className}
      onPress={onPress}
    />
  );
}

export function Section({ pillar, badge, actions, header, children }: SectionProps) {
  const { title, icon } = PILLARS[pillar];
  const floating = useSectionHandle(pillar);
  const floatButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<DragGesture | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const titleId = `section-${pillar}-title`;
  const contentId = `section-${pillar}-content`;
  const isFloating = floating?.isFloating ?? false;
  // 3-state model (SRS-CY-33306), one record in the sidebar store: floating
  // panels render expanded; docking restores the section's own open state.
  const isOpen = floating?.isOpen ?? true;
  const effectiveOpen = isFloating ? true : isOpen;

  const toggleFloat = () => {
    if (!floating || (!isFloating && !floating.canFloat)) return;
    if (isFloating) {
      floating.dock();
    } else {
      // Read the docked geometry before the re-render switches the panel to fixed.
      const dockedRect = panelRef.current?.getBoundingClientRect();
      floating.float();
      if (dockedRect) {
        // Spawn anchored at the docked slot so the panel pops out in place.
        floating.moveTo(
          clampFloatRect(
            {
              x: dockedRect.left - floating.bounds.left - SPAWN_X_NUDGE_PX,
              y: dockedRect.top - floating.bounds.top,
              width: floatWidth(pillar),
            },
            floating.bounds,
          ),
        );
      }
    }
    floating.announce(`${title} ${isFloating ? "docked" : "floating"}`);
    // The placeholder's Dock button unmounts on dock — put focus back on the header control.
    requestAnimationFrame(() => floatButtonRef.current?.focus());
  };

  const endGesture = useCallback(() => {
    gesture.current = null;
    setIsDragging(false);
    x.set(0);
    y.set(0);
    floating?.setDropTarget(false);
  }, [x, y, floating]);

  // Escape mid-gesture restores the pre-gesture rect (SDS-CY-011016): a
  // drag-out that already detached is docked back; a floating panel returns
  // to its pre-gesture placement.
  useEffect(() => {
    if (!isDragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const g = gesture.current;
      endGesture();
      if (g?.detached && !g.wasFloating) {
        floating?.dock();
        floating?.announce(`${title} docked`);
      } else if (g?.wasFloating) {
        floating?.moveTo(g.baseRect);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDragging, floating, endGesture, title]);

  // Below the narrow-viewport threshold floating is not offered (SRS-CY-33321)
  // — a panel already out docks back instead of lingering unusable.
  useEffect(() => {
    if (floating && floating.isFloating && !floating.canFloat) floating.dock();
  }, [floating]);

  const onPanStart = (_e: unknown, info: { point: { x: number; y: number } }) => {
    if (!floating) return;
    gesture.current = {
      wasFloating: isFloating,
      detached: isFloating,
      baseRect: floating.rect ?? { x: 0, y: 0, width: 0 },
      startX: info.point.x,
      startY: info.point.y,
      lastRect: null,
    };
    // Armed for every gesture kind — Escape must cancel either origin.
    setIsDragging(true);
  };

  // Dock-drop hit test: the sidebar's x-range, at any height — the placeholder
  // row supplies the column's left/right while the drag is running. A floating
  // panel needs real travel first, else grabbing its header over the sidebar
  // slot it spawned on would re-dock on release.
  const dockCandidate = (point: { x: number; y: number }, g: DragGesture) => {
    if (!overSidebar(point)) return false;
    if (!g.wasFloating) return true;
    return Math.hypot(point.x - g.startX, point.y - g.startY) >= DOCK_DROP_MIN_TRAVEL_PX;
  };

  const overSidebar = (point: { x: number; y: number }) => {
    const rect = placeholderRef.current?.getBoundingClientRect() ?? null;
    return Boolean(rect && point.x >= rect.left && point.x <= rect.right);
  };

  const onPan = (_e: unknown, info: { point: { x: number; y: number } }) => {
    const g = gesture.current;
    if (!g || !floating) return;
    if (!g.detached) {
      // Narrow viewports never offer floating (SRS-CY-33321).
      if (!floating.canFloat) return;
      const dx = info.point.x - g.startX;
      const dy = info.point.y - g.startY;
      if (Math.hypot(dx, dy) < DETACH_THRESHOLD_PX) return;
      // Detach: spawn at the pointer at the pillar's float width.
      const spawn = clampFloatRect(
        {
          x: info.point.x - floating.bounds.left - GRAB_OFFSET.x,
          y: info.point.y - floating.bounds.top - GRAB_OFFSET.y,
          width: floatWidth(pillar),
        },
        floating.bounds,
      );
      g.detached = true;
      g.baseRect = spawn;
      g.startX = info.point.x;
      g.startY = info.point.y;
      floating.float();
      floating.moveTo(spawn);
      floating.announce(`${title} floating`);
    }
    const target = clampFloatRect(
      {
        x: g.baseRect.x + (info.point.x - g.startX),
        y: g.baseRect.y + (info.point.y - g.startY),
        width: g.baseRect.width,
      },
      floating.bounds,
    );
    x.set(target.x - g.baseRect.x);
    y.set(target.y - g.baseRect.y);
    g.lastRect = target;
    floating.setDropTarget(dockCandidate(info.point, g));
  };

  const onPanEnd = (_e: unknown, info: { point: { x: number; y: number } }) => {
    const g = gesture.current;
    if (!g) return;
    const overSlot = dockCandidate(info.point, g);
    endGesture();
    if (!g.detached) return; // plain click — never detached, nothing to commit
    if (overSlot) {
      // Release over the sidebar docks at the section's slot (SRS-CY-33310).
      floating?.dock();
      floating?.announce(`${title} docked`);
    } else if (g.lastRect) {
      floating?.moveTo(g.lastRect);
    }
  };

  const onGripKeyDown = (e: React.KeyboardEvent) => {
    if (!floating?.isFloating) return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const distance = e.shiftKey ? FLOAT_KEYBOARD_STEP_LARGE : FLOAT_KEYBOARD_STEP;
    floating.moveBy(step[0] * distance, step[1] * distance);
  };

  // One control: press toggles float/dock, drag floats out or moves (SRS-CY-33306).
  // Framer's pan threshold (~3px) means any onPan callback counts as a drag —
  // the press that follows a drag's pointerup must not re-toggle. The flag is
  // shared with the expander/title drag surface below.
  const suppressPress = useRef(false);
  const onControlPress = () => {
    if (suppressPress.current) {
      suppressPress.current = false;
      return;
    }
    toggleFloat();
  };

  const onExpanderClick = () => {
    if (suppressPress.current) {
      suppressPress.current = false;
      return;
    }
    floating?.toggleOpen();
  };

  // Drag surface: the control itself plus the expander/title click area.
  const dragHandlers = {
    onPanStart: (e: unknown, info: { point: { x: number; y: number } }) => {
      suppressPress.current = false;
      onPanStart(e, info);
    },
    onPan: (e: unknown, info: { point: { x: number; y: number } }) => {
      suppressPress.current = true;
      onPan(e, info);
    },
    onPanEnd: (e: unknown, info: { point: { x: number; y: number } }) => {
      onPanEnd(e, info);
      // The release's press event fires after panEnd within the same task —
      // reset past it, or a drag ending off-control leaves the next genuine
      // click swallowed.
      requestAnimationFrame(() => {
        suppressPress.current = false;
      });
    },
  };

  // Merged float/dock + drag control. The pan gesture lives on the header row's
  // drag wrapper (see SectionHeaderRow), so this stays a plain control — the
  // wrapper never remounts across a float/dock, keeping the gesture alive.
  // The control exists only in floatable sidebars; within them, the narrow
  // viewport disables it (SRS-CY-33321). Non-floatable sidebars (Explorer)
  // use the same handle purely for the accordion.
  const control = floating?.floatable && (
    <motion.div className="flex items-center" onKeyDown={onGripKeyDown}>
      <FloatDockButton
        ref={floatButtonRef}
        pillar={pillar}
        isFloating={isFloating}
        isDisabled={!floating.canFloat}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        onPress={onControlPress}
      />
    </motion.div>
  );

  return (
    <>
      {isFloating && (
        // Wrapper carries the ref for drop-target hit testing; as a direct
        // child of the sidebar column it must not stretch into the space the
        // floated body vacated.
        <div ref={placeholderRef} className="grow-0">
          <SectionHeaderRow
            className={twMerge(floating?.isDropTarget && "ring-2 ring-inset ring-primary")}
            title={title}
            badge={badge}
            // Same control as the panel header, own instance: sharing `control`
            // would share floatButtonRef, and this copy unmounting on dock would
            // null the panel's ref. The wrapper centers it like the panel's does.
            leadingControl={
              <div className="flex items-center">
                <FloatDockButton pillar={pillar} isFloating onPress={toggleFloat} />
              </div>
            }
          />
        </div>
      )}

      <motion.div
        ref={panelRef}
        {...(isFloating ? { [FLOATING_PANEL_ATTR]: "" } : {})}
        role={isFloating ? "group" : undefined}
        aria-labelledby={isFloating ? titleId : undefined}
        style={{ ...(floating?.style ?? {}), x, y }}
        onPointerDown={isFloating ? floating?.bringToFront : undefined}
        className={twMerge(
          "flex flex-col w-full bg-card text-muted-foreground",
          isFloating && FLOATING_PANEL_CLASSES,
        )}
      >
        <header className="z-10 sticky top-0 left-0">
          <SectionHeaderRow
            // The static icon yields to the control's pillar icon exactly where
            // the control exists; non-floatable sidebars keep the static icon.
            icon={floating?.floatable ? undefined : icon}
            title={title}
            titleId={titleId}
            badge={badge}
            leadingControl={control}
            drag={dragHandlers}
            actions={actions}
            onClick={isFloating ? undefined : onExpanderClick}
            selected={effectiveOpen}
            ariaExpanded={isFloating ? undefined : isOpen}
            ariaControls={isFloating || !isOpen ? undefined : contentId}
            chevronSlot={
              isFloating ? undefined : (
                <Icon icon={isOpen ? "ChevronDown" : "ChevronRight"} size="xs" />
              )
            }
            className={isFloating ? TRANSLUCENT_CLASSES : undefined}
          />

          {/* Sticky content via props, e.g. Histogram */}
          {effectiveOpen && (
            <div className={isFloating ? TRANSLUCENT_CLASSES : "bg-background"}>{header}</div>
          )}
        </header>

        {/* CSS grid 0fr/1fr collapse animates to measured content height with
          no JS measuring; inert keeps the always-mounted body unfocusable
          while collapsed. Floating panels are always expanded. */}
        <div
          id={contentId}
          className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: effectiveOpen ? "1fr" : "0fr" }}
          aria-hidden={!effectiveOpen || undefined}
          inert={!effectiveOpen || undefined}
        >
          <div className={twMerge("min-h-0 overflow-hidden bg-card", isFloating && "bg-card/80")}>
            {children}
          </div>
        </div>
      </motion.div>
    </>
  );
}
