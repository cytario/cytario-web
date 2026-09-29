import { useEffect } from "react";

import { LayersTooltip } from "./LayersTooltip";
import { classNameOf } from "../../../state/store/annotations/annotations.store";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import type { CompositeTooltip } from "../../../state/store/types";

/** Renders the click popup — but only in the panel that opened it, and only
 *  while every annotation it references still exists and is visible: a deleted
 *  or now-hidden feature makes the snapshot stale, so the popup closes. */
export const ImagePopupLayer = ({ imagePanelId }: { imagePanelId: number }) => {
  const mine = useViewerStore(select.panelPopup(imagePanelId));
  const closePopup = useViewerStore(select.closePopup);
  const annotationSets = useViewerStore((s) => s.annotationSets);
  const annotationView = useViewerStore((s) => s.annotationView);

  useEffect(() => {
    if (!mine) return;
    const stale = mine.annotationRefs.some(({ id, setId }) => {
      const feature = annotationSets.find((s) => s.id === setId)?.features.find((f) => f.id === id);
      if (!feature) return true;
      return annotationView[setId]?.hiddenClasses?.includes(classNameOf(feature)) ?? false;
    });
    if (stale) closePopup();
  }, [mine, annotationSets, annotationView, closePopup]);

  if (!mine) return null;

  const tooltip: CompositeTooltip = {
    panelId: mine.panelId,
    cursor: mine.anchor,
    sections: mine.sections,
  };
  return <LayersTooltip tooltip={tooltip} pinned onClose={closePopup} />;
};
