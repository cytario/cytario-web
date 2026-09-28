import { useContextMenu } from "@cytario/design";
import type { DeckGLRef } from "@deck.gl/react";
import { useCallback, useState } from "react";

import {
  classNameOf,
  isReservedClassName,
} from "../../../state/store/annotations/annotations.store";
import { useViewerStore, useViewerStoreApi } from "../../../state/store/core/ViewerStoreContext";
import { useCanAnnotate } from "../../../utils/useCanAnnotate";
import { AnnotationMenuItems } from "../../sidebar/AnnotationsSection/AnnotationMenuItems";
import { useAnnotationFeatureActions } from "../../sidebar/AnnotationsSection/useAnnotationFeatureActions";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** Layer-id conventions of `useAnnotationsLayer`: `annotations-…` for sets,
 *  `-selection-` halo layers excluded. */
const ANNOTATIONS_ID_PREFIX = "annotations-";
const SELECTION_ID_SEGMENT = "-selection-";

interface CanvasMenuTarget {
  feature: AnnotationFeature;
  setId: string;
  classNames: string[];
  label: string;
}

interface UseCanvasAnnotationContextMenuProps {
  /** The deck ref from `useCompositeHover` — used for picking under the cursor. */
  deckRef: React.RefObject<DeckGLRef | null>;
}

/** Right-click context menu for annotation polygons on the canvas: resolves the
 *  annotation under the cursor via deck picking and opens the same shared menu
 *  the sidebar items use (every set is editable per the connection grant).
 *  Right-click on empty canvas leaves the native menu. */
export const useCanvasAnnotationContextMenu = ({
  deckRef,
}: UseCanvasAnnotationContextMenuProps) => {
  const storeApi = useViewerStoreApi();
  const canAnnotate = useCanAnnotate();
  const activeSetId = useViewerStore((s) => s.activeSetId);
  const sets = useViewerStore((s) => s.annotationSets);

  const [target, setTarget] = useState<CanvasMenuTarget | null>(null);

  // The actions bind to the menued set while the menu is open, else the active
  // set, so sidebar and canvas share one action implementation per gesture.
  const menuSet = target
    ? sets.find((s) => s.id === target.setId)
    : sets.find((s) => s.id === activeSetId);
  const actions = useAnnotationFeatureActions({
    setId: menuSet?.id ?? "",
    features: menuSet?.features ?? [],
  });

  const resolveTarget = useCallback(
    (clientX: number, clientY: number): CanvasMenuTarget | null => {
      const deck = deckRef.current?.deck;
      const canvas = deck?.getCanvas();
      if (!deck || !canvas) return null;

      const state = storeApi.getState();
      // Same gate as layer click-selection: draw/inspect modes own the cursor.
      if (state.annotationMode !== "view") return null;

      const rect = canvas.getBoundingClientRect();
      const picks = deck.pickMultipleObjects({
        x: clientX - rect.left,
        y: clientY - rect.top,
        radius: 0,
        depth: 20,
      });

      for (const pick of picks) {
        const layerId = pick.layer?.id ?? "";
        if (!layerId.startsWith(ANNOTATIONS_ID_PREFIX) || layerId.includes(SELECTION_ID_SEGMENT)) {
          continue;
        }
        const feature = pick.object as AnnotationFeature | undefined;
        if (!feature?.id) continue;

        // Picks report sublayers (`annotations-0-polygons-fill`, …), so match a
        // peer by its id occurring in the layer id; anything else on the panel's
        // prefix is the own set.
        const peer = state.annotationSets.find((s) => layerId.includes(s.id));
        const setId = peer ? peer.id : state.activeSetId;
        if (!setId) continue;
        const set = state.annotationSets.find((s) => s.id === setId);
        if (!set) continue;

        // A hidden class renders at alpha 0 — it is not really visible, so it
        // must not open a menu.
        const hidden = new Set(state.annotationView[setId]?.hiddenClasses ?? []);
        if (hidden.has(classNameOf(feature))) continue;

        const cls = classNameOf(feature);
        // "Move to <class>" offers the actioned set's classes other than the
        // region's own (same menu semantics as the sidebar, SRS-CY-33257).
        const classNames = canAnnotate
          ? [
              ...new Set(
                set.features
                  .map((f) => classNameOf(f))
                  .filter((name) => !isReservedClassName(name) && name !== cls),
              ),
            ]
          : [];
        const kind = feature.geometry.type === "Point" ? "point" : "region";
        return {
          feature,
          setId,
          classNames,
          label: `${feature.properties?.classification?.name ?? "Unclassified"} ${kind}`,
        };
      }
      return null;
    },
    [deckRef, storeApi, canAnnotate],
  );

  const ctx = useContextMenu({
    label: target ? `Actions for ${target.label}` : "Annotation actions",
    content: target ? (
      <AnnotationMenuItems
        editable={canAnnotate}
        classNames={target.classNames}
        onZoom={() => actions.zoomToFeature(target.feature)}
        onClassify={(name) => actions.classify(target.feature, name)}
        onClear={() => actions.clearClass(target.feature)}
        onDelete={() => actions.deleteFeatures(target.feature)}
      />
    ) : null,
  });

  /** Attach via `onContextMenuCapture` on the element wrapping `<DeckGL>`. */
  const onCanvasContextMenu = useCallback(
    (event: React.MouseEvent) => {
      const hit = resolveTarget(event.clientX, event.clientY);
      if (!hit) return;
      setTarget(hit);
      // The hook's handler preventDefaults and anchors the menu at the cursor.
      ctx.targetProps.onContextMenu(event);
    },
    [resolveTarget, ctx],
  );

  return { onCanvasContextMenu, menu: ctx.menu, isOpen: ctx.isOpen };
};
