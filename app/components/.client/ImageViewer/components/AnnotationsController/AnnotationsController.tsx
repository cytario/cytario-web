import { EmptyState, IconButton } from "@cytario/design";
import { MapPin, Spline } from "lucide-react";

import { type AnnotationMode } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";

/**
 * Sidebar control for image annotations: draw-mode toggles (polygon / point)
 * and the current count. Editing happens on the canvas via the
 * `EditableGeoJsonLayer`; this just drives the shared mode.
 */
export const AnnotationsController = () => {
  const features = useViewerStore((s) => s.annotationFeatures);
  const mode = useViewerStore((s) => s.annotationMode);
  const setMode = useViewerStore((s) => s.setAnnotationMode);
  const setSelectedIndexes = useViewerStore((s) => s.setAnnotationSelectedIndexes);

  const toggle = (target: AnnotationMode) => {
    setSelectedIndexes([]);
    setMode(mode === target ? "view" : target);
  };

  return (
    <FeatureItem
      title="Annotations"
      badge={features.length ? String(features.length) : undefined}
      actions={
        <>
          <IconButton
            icon={Spline}
            aria-label={mode === "draw-polygon" ? "Stop drawing" : "Draw polygon"}
            aria-pressed={mode === "draw-polygon"}
            variant="ghost"
            size="xs"
            className={mode === "draw-polygon" ? "text-foreground" : undefined}
            onPress={() => toggle("draw-polygon")}
          />
          <IconButton
            icon={MapPin}
            aria-label={mode === "draw-point" ? "Stop drawing" : "Draw point"}
            aria-pressed={mode === "draw-point"}
            variant="ghost"
            size="xs"
            className={mode === "draw-point" ? "text-foreground" : undefined}
            onPress={() => toggle("draw-point")}
          />
        </>
      }
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
