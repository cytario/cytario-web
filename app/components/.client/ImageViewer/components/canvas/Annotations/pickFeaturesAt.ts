import type { Deck, PickingInfo } from "@deck.gl/core";

import { classNameOf } from "../../../state/store/annotations/annotations.store";
import { OVERLAYS_ID_PREFIX } from "../Overlays/OverlayComposite";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** Layer-id conventions of the canvas layers (see `useCompositeHover`, `useAnnotationsLayer`). */
const CHANNELS_ID_HINT = "channels-";
const ANNOTATIONS_ID_PREFIX = "annotations-";
const ANNOTATIONS_SELECTION_SUFFIX = "-selection-";

export interface PickedAnnotation {
  feature: AnnotationFeature;
  setId: string;
  /** Raw deck pick — providers' `getTooltipItems(pick)` consume it. */
  pick: PickingInfo;
}

export interface RoutedPicks {
  /** Raw picks, in deck order (top-most first) — routed by layer id. */
  picks: PickingInfo[];
  channelPicks: PickingInfo[];
  overlayPicks: PickingInfo[];
  /** Annotation features at the point: deduped (sublayers), selection-halo layers
   *  excluded, hidden-class features filtered per their own set (invisible =
   *  unpickable for tooltip, selection, and menu alike). */
  annotations: PickedAnnotation[];
}

export interface PickState {
  activeSetId: string | null;
  annotationSets: { id: string }[];
  annotationView: Record<string, { hiddenClasses: string[] } | undefined>;
}

/** Single pick pipeline for every "what is under this canvas point?" consumer —
 *  hover tooltip, click popup/selection, and the context menu — so what is
 *  shown, what is selected, and what is actioned can never diverge. */
export const pickFeaturesAt = (deck: Deck, x: number, y: number, state: PickState): RoutedPicks => {
  const picks = deck.pickMultipleObjects({ x, y, radius: 0, depth: 20 });

  const routed: RoutedPicks = { picks, channelPicks: [], overlayPicks: [], annotations: [] };
  const seenFeatures = new Set<string>();

  for (const pick of picks) {
    const layerId = pick.layer?.id ?? "";

    // Channels — the sublayers are `Tiled-Image-channels-<id>` and
    // `Background-Image-channels-<id>`, both contain `channels-`.
    if (layerId.includes(CHANNELS_ID_HINT)) {
      routed.channelPicks.push(pick);
      continue;
    }

    // Overlays
    if (layerId.startsWith(OVERLAYS_ID_PREFIX)) {
      routed.overlayPicks.push(pick);
      continue;
    }

    // Annotations — skip selection-halo layers (pickable: false, but guard anyway).
    if (
      layerId.startsWith(ANNOTATIONS_ID_PREFIX) &&
      !layerId.includes(ANNOTATIONS_SELECTION_SUFFIX)
    ) {
      const feature = pick.object as AnnotationFeature | undefined;
      if (!feature?.id || seenFeatures.has(feature.id)) continue;

      // Picks report sublayers (`annotations-0-polygons-fill`, …), so match a
      // peer by its id occurring in the layer id; anything else on the
      // annotations prefix is the own set.
      const peer = state.annotationSets.find((s) => layerId.includes(s.id));
      const setId = peer ? peer.id : state.activeSetId;
      if (!setId) continue;

      // A hidden class renders at alpha 0 — it is not really visible, so it
      // must not appear in tooltips, selections, or menus.
      const hidden = state.annotationView[setId]?.hiddenClasses;
      if (hidden?.includes(classNameOf(feature))) continue;

      seenFeatures.add(feature.id);
      routed.annotations.push({ feature, setId, pick });
    }
  }

  return routed;
};
