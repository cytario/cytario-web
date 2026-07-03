import { useMemo } from "react";

import { AnnotationsList } from "./AnnotationsList";
import { AnnotationsTools } from "./AnnotationsTools";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";
import { useCurrentUser } from "~/hooks/useCurrentUser";

export const AnnotationsController = () => {
  const annotationsByUser = useViewerStore((s) => s.annotationsByUser);
  const annotationView = useViewerStore((s) => s.annotationView);
  const setOpacity = useViewerStore((s) => s.setAnnotationOpacity);

  const ownUserId = useCurrentUser()?.sub;

  // One flat FeatureItem per user, own first. Own always appears — even with no
  // annotations yet — so its draw tools are reachable to create the first one.
  // Loading + per-user S3 writes are the sync middleware's job; this is a pure renderer.
  const entries = useMemo(() => {
    const list = Object.entries(annotationsByUser);
    if (ownUserId && !annotationsByUser[ownUserId]) list.push([ownUserId, []]);
    return list.sort(([a], [b]) => (a === ownUserId ? -1 : b === ownUserId ? 1 : 0));
  }, [annotationsByUser, ownUserId]);

  return entries.map(([userId, features]) => {
    const isOwn = userId === ownUserId;
    return (
      <FeatureItem
        key={userId}
        title={isOwn ? "Annotations (You)" : `Annotations (${userId.slice(0, 6)})`}
        badge={features.length ? String(features.length) : undefined}
        header={isOwn ? <AnnotationsTools /> : undefined}
        actions={
          <FeatureItemSlider
            aria-label="Annotation opacity"
            value={annotationView[userId]?.opacity ?? 1}
            onChange={(value) => setOpacity(userId, value)}
          />
        }
      >
        <AnnotationsList userId={userId} features={features} editable={isOwn} />
      </FeatureItem>
    );
  });
};
