import { EmptyState } from "@cytario/design";
import { Spline } from "lucide-react";

import { AnnotationsList } from "./AnnotationsList";
import { AnnotationsTools } from "./AnnotationsTools";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";

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
      header={<AnnotationsTools />}
    >
      {features.length === 0 ? (
        <EmptyState
          title="No annotations"
          description="Use the draw tools to add regions."
          icon={Spline}
          className="py-6"
        />
      ) : (
        <AnnotationsList />
      )}
    </FeatureItem>
  );
};
