import { IconButton } from "@cytario/design";

import { type AnnotationMode } from "../../state/store/types";
import { useUndoRedo } from "../../state/store/useUndoRedo";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

/**
 * Sidebar control for image annotations: draw-mode toggles (polygon / point),
 * undo/redo, and the current count. Editing happens on the canvas via the
 * `EditableGeoJsonLayer`; this just drives the shared mode and history.
 */

const drawingTools = [
  { mode: "draw-polygon", icon: "Lasso", label: "Draw polygon" },
  { mode: "draw-freehand", icon: "Spline", label: "Draw freehand" },
  { mode: "draw-point", icon: "MapPin", label: "Draw point" },
] as const;

export const AnnotationsTools = () => {
  const activeMode = useViewerStore((s) => s.annotationMode);
  const setMode = useViewerStore((s) => s.setAnnotationMode);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  const toggle = (target: AnnotationMode) => {
    setSelectedIds([]);
    setMode(activeMode === target ? "view" : target);
  };
  return (
    <div className="flex flex-row items-center p-2 gap-1">
      {drawingTools.map(({ mode, icon, label }) => {
        const isActive = activeMode === mode;
        return (
          <IconButton
            key={mode}
            icon={icon}
            label={isActive ? "Stop drawing" : label}
            aria-pressed={isActive}
            variant="ghost"
            size="xs"
            className={isActive ? "bg-primary! text-primary-foreground!" : undefined}
            onPress={() => toggle(mode)}
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
