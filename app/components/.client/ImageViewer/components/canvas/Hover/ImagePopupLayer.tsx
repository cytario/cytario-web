import { useEffect, useMemo } from "react";

import { TooltipSections } from "./LayersTooltip";
import { PopupCard } from "./PopupCard";
import { classNameOf } from "../../../state/store/annotations/annotations.store";
import { useViewerStore, useViewerStoreApi } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { useCanAnnotate } from "../../../utils/useCanAnnotate";
import {
  type JoinOfferAction,
  joinFeaturesInSet,
  joinOffersForFeatures,
} from "../../annotations/joinFeatures";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";

interface ResolvedAnnotation {
  id: string;
  setId: string;
  set: AnnotationSet;
  feature: AnnotationFeature;
}

/** The click popup: a pinned snapshot of the composite tooltip content at the
 *  clicked point, with "Join <n> <class> annotations" offers for same-class
 *  region groups. Live staleness: a referenced feature that is deleted or
 *  becomes hidden closes the popup. */
export const ImagePopupLayer = ({ imagePanelId }: { imagePanelId: number }) => {
  const storeApi = useViewerStoreApi();
  const mine = useViewerStore(select.panelPopup(imagePanelId));
  const closePopup = useViewerStore(select.closePopup);
  const annotationSets = useViewerStore((s) => s.annotationSets);
  const annotationView = useViewerStore((s) => s.annotationView);
  const canAnnotate = useCanAnnotate();

  // Resolve the popup's annotation refs against the live sets — the render
  // data, the join offers, and the stale-guard share this one resolution.
  const resolved = useMemo((): ResolvedAnnotation[] => {
    if (!mine) return [];
    return mine.annotationRefs.flatMap(({ id, setId }): ResolvedAnnotation[] => {
      const set = annotationSets.find((s) => s.id === setId);
      const feature = set?.features.find((f) => f.id === id);
      if (!set || !feature) return [];
      // A hidden class renders at alpha 0 — it is not really visible.
      if (annotationView[setId]?.hiddenClasses?.includes(classNameOf(feature))) return [];
      return [{ id, setId, set, feature }];
    });
  }, [mine, annotationSets, annotationView]);

  // Stale-guard: any referenced feature that vanished closes the popup.
  useEffect(() => {
    if (mine && resolved.length !== mine.annotationRefs.length) closePopup();
  }, [mine, resolved, closePopup]);

  // "Join <n> <class> annotations" offers: one per same-class region group
  // (≥2) per set among the point's editable features. The popup closes
  // imperatively before the store write — the swallowed refs would trip the
  // stale-guard a frame later anyway.
  const joinOffers = useMemo((): JoinOfferAction[] => {
    if (!mine || !canAnnotate) return [];
    const bySet = new Map<string, ResolvedAnnotation[]>();
    for (const annotation of resolved) {
      const block = bySet.get(annotation.setId) ?? [];
      block.push(annotation);
      bySet.set(annotation.setId, block);
    }
    return [...bySet.values()].flatMap((block) =>
      joinOffersForFeatures(block.map((a) => a.feature)).map((offer) => ({
        ...offer,
        onJoin: () => {
          closePopup();
          joinFeaturesInSet(storeApi, block[0].setId, offer.ids);
        },
      })),
    );
  }, [mine, resolved, canAnnotate, closePopup, storeApi]);

  if (!mine) return null;

  return (
    <PopupCard anchor={mine.anchor} onClose={closePopup} label="Image details at the clicked point">
      <TooltipSections sections={mine.sections} joinOffers={joinOffers} />
    </PopupCard>
  );
};
