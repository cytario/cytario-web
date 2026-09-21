import { IconButton } from "@cytario/design";
import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

import { StampSizeInput } from "./canvas/Annotations/StampSizeInput";
import { ScaleBar } from "./canvas/Measurements/ScaleBar";
import { useAnnotationModeKeyboard } from "./canvas/useAnnotationModeKeyboard";
import { useUndoRedo } from "../state/store/core/useUndoRedo";
import { useUndoRedoShortcuts } from "../state/store/core/useUndoRedoShortcuts";
import { useViewerStore } from "../state/store/core/ViewerStoreContext";
import { type AnnotationMode } from "../state/store/types";
import { useCanAnnotate } from "../utils/useCanAnnotate";

const tools = [
  { mode: "view", icon: "Hand", label: "Drag, pan, and zoom" },
  { mode: "inspect", icon: "Crosshair", label: "Inspect pixel values" },
  { mode: "draw-freehand", icon: "Pencil", label: "Draw freehand" },
  { mode: "draw-polygon", icon: "Pentagon", label: "Draw polygon" },
  { mode: "draw-point", icon: "MapPin", label: "Draw point" },
  { mode: "draw-box", icon: "Square", label: "Stamp box" },
] as const;

export const Toolbar = () => {
  const activeMode = useViewerStore((s) => s.annotationMode);
  const setMode = useViewerStore((s) => s.setAnnotationMode);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const canAnnotate = useCanAnnotate();
  const { undo, redo, canUndo, canRedo } = useUndoRedo();
  useUndoRedoShortcuts();
  useAnnotationModeKeyboard();

  const activate = (target: AnnotationMode) => {
    if (target !== "view" && target !== "inspect") setSelectedIds([]);
    setMode(target);
  };

  return (
    <>
      <FloatingBar className="bottom-8 left-8 p-5">
        <ScaleBar />
      </FloatingBar>

      <FloatingBar
        role="toolbar"
        aria-label="Annotation tools"
        className="bottom-8 left-1/2 -translate-x-1/2"
      >
        {tools
          .filter(({ mode }) => canAnnotate || !mode.startsWith("draw-"))
          .map(({ mode, icon, label }) => {
            const isActive = activeMode === mode;
            return (
              <IconButton
                key={mode}
                icon={icon}
                label={label}
                aria-pressed={isActive}
                variant={isActive ? "primary" : "ghost"}
                onPress={() => activate(mode)}
              />
            );
          })}

        {canAnnotate && activeMode === "draw-box" && <StampSizeInput />}

        {canAnnotate && (
          <>
            <IconButton
              icon="RotateCcw"
              label="Undo"
              variant="ghost"
              isDisabled={!canUndo}
              onPress={undo}
            />

            <IconButton
              icon="RotateCw"
              label="Redo"
              variant="ghost"
              isDisabled={!canRedo}
              onPress={redo}
            />
          </>
        )}
      </FloatingBar>
    </>
  );
};

export const FloatingBar = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    className={twMerge(
      `
        z-30 absolute
        flex flex-row items-center
        p-2 gap-4 rounded-full
        bg-background/80 backdrop-blur-sm
        shadow-md
      `,
      className,
    )}
  />
);
