import { IconButton } from "@cytario/design";

import { type AnnotationMode } from "../../state/store/types";
import { useUndoRedo } from "../../state/store/useUndoRedo";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

/**
 * Sidebar control for image annotations: a default drag/pan/zoom button,
 * draw-mode tools (polygon / freehand / point), undo/redo, and the current
 * count. Editing happens on the canvas via the `EditableGeoJsonLayer`;
 * this just drives the shared mode and history.
 */

const drawingTools = [
  { mode: "draw-polygon", icon: "Pentagon", label: "Draw polygon" },
  { mode: "draw-freehand", icon: "Pencil", label: "Draw freehand" },
  { mode: "draw-point", icon: "MapPin", label: "Draw point" },
] as const;

export const AnnotationsTools = () => {
  const activeMode = useViewerStore((s) => s.annotationMode);
  const setMode = useViewerStore((s) => s.setAnnotationMode);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  const activate = (target: AnnotationMode) => {
    if (target !== "view") setSelectedIds([]);
    setMode(target);
  };

  return (
    <div
      className="flex flex-row items-center p-2 gap-1"
      role="toolbar"
      aria-label="Annotation tools"
    >
      <IconButton
        icon="Hand"
        label="Drag, pan, and zoom"
        aria-pressed={activeMode === "view"}
        variant="ghost"
        size="xs"
        className={
          activeMode === "view"
            ? "bg-primary! text-primary-foreground! ring-2 ring-primary ring-offset-1 ring-offset-background"
            : undefined
        }
        onPress={() => activate("view")}
      />
      {drawingTools.map(({ mode, icon, label }) => {
        const isActive = activeMode === mode;
        return (
          <IconButton
            key={mode}
            icon={icon}
            label={label}
            aria-pressed={isActive}
            variant="ghost"
            size="xs"
            className={
              isActive
                ? "bg-primary! text-primary-foreground! ring-2 ring-primary ring-offset-1 ring-offset-background"
                : undefined
            }
            onPress={() => activate(mode)}
          />
        );
      })}
      <div className="ml-auto flex flex-row gap-1">
        <IconButton
          icon="RotateCcw"
          label="Undo"
          variant="ghost"
          size="xs"
          isDisabled={!canUndo}
          onPress={undo}
        />
        <IconButton
          icon="RotateCw"
          label="Redo"
          variant="ghost"
          size="xs"
          isDisabled={!canRedo}
          onPress={redo}
        />
      </div>
    </div>
  );
};
