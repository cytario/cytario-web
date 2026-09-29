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

/** A pick's annotation set: a peer set id occurring in the (sub)layer id marks
 *  the set, anything else on the annotations prefix is the active (own) set.
 *  Single owner — selection, tooltip, and menu must resolve identically. */
export const setIdFromLayerId = (
  layerId: string,
  sets: { id: string }[],
  activeSetId: string | null,
): string | null => {
  const peer = sets.find((s) => layerId.includes(s.id));
  return peer ? peer.id : activeSetId;
};

/** Class name of a tooltip item (the single values key). */
export const classNameOfItem = (item: { values: Record<string, unknown> }): string =>
  Object.keys(item.values)[0] ?? "";

/** Tooltip items grouped by class name (case-insensitive; z-order preserved
 *  within a class) — the point's regions otherwise interleave classes. */
export const sortAnnotationItemsByClass = <T extends { values: Record<string, unknown> }>(
  items: T[],
): T[] =>
  [...items].sort((a, b) =>
    classNameOfItem(a).localeCompare(classNameOfItem(b), undefined, { sensitivity: "base" }),
  );

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
      const setId = feature?.id
        ? setIdFromLayerId(layerId, state.annotationSets, state.activeSetId)
        : null;
      if (!feature?.id || !setId || seenFeatures.has(`${setId}:${feature.id}`)) continue;

      // A hidden class renders at alpha 0 — it is not really visible, so it
      // must not appear in tooltips, selections, or menus.
      const hidden = state.annotationView[setId]?.hiddenClasses;
      if (hidden?.includes(classNameOf(feature))) continue;

      seenFeatures.add(`${setId}:${feature.id}`);
      routed.annotations.push({ feature, setId, pick });
    }
  }

  return routed;
};
