import { IconButton } from "@cytario/design";

import { FloatingBar } from "./FloatingBar";
import { type AnnotationMode } from "../state/store/types";
import { useUndoRedo } from "../state/store/useUndoRedo";
import { useViewerStore } from "../state/store/ViewerStoreContext";

const tools = [
  { mode: "view", icon: "Hand", label: "Drag, pan, and zoom" },
  { mode: "inspect", icon: "Search", label: "Inspect pixel values" },
  { mode: "draw-freehand", icon: "Pencil", label: "Draw freehand" },
  { mode: "draw-polygon", icon: "Pentagon", label: "Draw polygon" },
  { mode: "draw-point", icon: "MapPin", label: "Draw point" },
] as const;

/** Floating canvas toolbar: interaction modes + undo/redo. */
export const Toolbar = () => {
  const activeMode = useViewerStore((s) => s.annotationMode);
  const setMode = useViewerStore((s) => s.setAnnotationMode);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  const activate = (target: AnnotationMode) => {
    if (target !== "view" && target !== "inspect") setSelectedIds([]);
    setMode(target);
  };

  return (
    <FloatingBar
      role="toolbar"
      aria-label="Annotation tools"
      className="bottom-8 left-1/2 -translate-x-1/2"
    >
      {tools.map(({ mode, icon, label }) => {
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
    </FloatingBar>
  );
};
