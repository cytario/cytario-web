import { EmptyState, IconButton } from "@cytario/design";
import { Lasso, MapPin, Spline } from "lucide-react";

import { type AnnotationMode } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";

/**
 * Sidebar control for image annotations: draw-mode toggles (polygon / point)
 * and the current count. Editing happens on the canvas via the
 * `EditableGeoJsonLayer`; this just drives the shared mode.
 */

const drawingTools = [
  { mode: "draw-polygon", icon: Lasso, label: "Draw polygon" },
  { mode: "draw-freehand", icon: Spline, label: "Draw freehand" },
  { mode: "draw-point", icon: MapPin, label: "Draw point" },
] as const;

const AnnotationTools = () => {
  const activeMode = useViewerStore((s) => s.annotationMode);
  const setMode = useViewerStore((s) => s.setAnnotationMode);
  const setSelectedIndexes = useViewerStore((s) => s.setAnnotationSelectedIndexes);

  const toggle = (target: AnnotationMode) => {
    setSelectedIndexes([]);
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
            aria-label={isActive ? "Stop drawing" : label}
            aria-pressed={isActive}
            variant="ghost"
            size="xs"
            className={isActive ? "bg-primary! text-primary-foreground!" : undefined}
            onPress={() => toggle(mode)}
          />
        );
      })}
    </div>
  );
};
export const AnnotationsController = () => {
  const features = useViewerStore((s) => s.annotationFeatures);
  const opacity = useViewerStore((s) => s.annotationOpacity);
  const setOpacity = useViewerStore((s) => s.setAnnotationOpacity);

  return (
    <FeatureItem
      title="Annotations"
      badge={features.length ? String(features.length) : undefined}
      actions={
        <FeatureItemSlider aria-label="Annotation opacity" value={opacity} onChange={setOpacity} />
      }
      header={<AnnotationTools />}
    >
      {features.length === 0 ? (
        <EmptyState
          title="No annotations"
          description="Use the draw tools to add regions."
          icon={Spline}
          className="py-6"
        />
      ) : (
        <div className="px-3 py-2 text-sm">{features.length} annotation(s)</div>
      )}
    </FeatureItem>
  );
};
