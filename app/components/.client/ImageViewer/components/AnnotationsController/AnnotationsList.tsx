import { useMemo, useRef } from "react";

import { AnnotationGroupRow } from "./AnnotationGroupRow";
import { AnnotationThumb } from "./AnnotationThumb";
import { flyToFeatureViewState } from "./flyToFeature";
import {
  classNameOf,
  selectUserHiddenClasses,
  UNCLASSIFIED_COLOR,
} from "../../state/store/slices/viewer.annotations.store";
import { RGB } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsController/ColorPicker/ColorPicker";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface AnnotationGroup {
  name: string;
  color: RGB | null;
  items: { feature: AnnotationFeature; index: number }[];
}

interface AnnotationsListProps {
  /** Owner of this set; the key edits route to. */
  userId: string;
  features: AnnotationFeature[];
  /** Current user owns this set → drawing/recolor/delete enabled. Peers are
   *  read-only until role-based edit-others lands; for now the menu still shows
   *  on every geometry, only the destructive actions are disabled. */
  editable: boolean;
}

/** Groups one user's annotation features by classification (with an
 *  `Unclassified` fallback). Each group can be shown/hidden and (when editable)
 *  recolored; a thumbnail click selects + flies to the feature. */
export const AnnotationsList = ({ userId, features, editable }: AnnotationsListProps) => {
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const updateUserFeatures = useViewerStore((s) => s.updateUserFeatures);
  const hiddenClasses = useViewerStore(selectUserHiddenClasses(userId));
  const toggleClassVisibility = useViewerStore((s) => s.toggleAnnotationClassVisibility);
  const setClassColor = useViewerStore((s) => s.setAnnotationClassColor);
  const viewState = useViewerStore((s) => s.viewStateActive);
  const setViewState = useViewerStore((s) => s.setViewStateActive);

  const annotationsGroups = useMemo<AnnotationGroup[]>(() => {
    const byName = new Map<string, AnnotationGroup>();
    features.forEach((feature, index) => {
      const name = classNameOf(feature);
      let group = byName.get(name);
      if (!group) {
        group = { name, color: feature.properties?.classification?.color ?? null, items: [] };
        byName.set(name, group);
      }
      group.items.push({ feature, index });
    });
    return [...byName.values()];
  }, [features]);

  // Flattened ids in displayed (grouped) order — the axis a Shift-range walks.
  const orderedIds = useMemo(
    () =>
      annotationsGroups.flatMap(
        (g) => g.items.map((it) => it.feature.properties?.id).filter(Boolean) as string[],
      ),
    [annotationsGroups],
  );

  // Last item selected without Shift — the fixed end of a range extension.
  const anchorId = useRef<string | null>(null);

  const select = (feature: AnnotationFeature, e?: MouseEvent | React.MouseEvent) => {
    const id = feature.properties?.id;
    if (!id) {
      setSelectedIds([]);
      return;
    }

    // Shift+click: contiguous range from the anchor to the clicked item over the
    // displayed order (anchor stays put). Falls back to plain select if there is
    // no live anchor.
    if (e?.shiftKey && anchorId.current) {
      const from = orderedIds.indexOf(anchorId.current);
      const to = orderedIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        setSelectedIds(orderedIds.slice(lo, hi + 1));
        return;
      }
    }

    // Cmd/Ctrl+click: toggle the clicked item in/out; the anchor moves to it.
    if (e && (e.metaKey || e.ctrlKey)) {
      setSelectedIds(
        selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
      );
      anchorId.current = id;
      return;
    }

    // Plain click: single select; reset the anchor.
    setSelectedIds([id]);
    anchorId.current = id;
  };

  const zoomToFeature = (feature: AnnotationFeature) => {
    // Select the target without routing through select() — zoom is navigation,
    // not a selection gesture, so it must not move the Shift-range anchor.
    const id = feature.properties?.id;
    setSelectedIds(id ? [id] : []);
    if (!viewState) return;
    const next = flyToFeatureViewState(feature.geometry, viewState);
    if (next) setViewState(next);
  };

  const deleteFeature = (feature: AnnotationFeature) => {
    setSelectedIds([]);
    anchorId.current = null;
    updateUserFeatures(
      userId,
      features.filter((f) => f !== feature),
    );
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {annotationsGroups.map(({ name, color, items }) => {
        const cssColor = rgb([...(color ?? UNCLASSIFIED_COLOR), 255]);
        return (
          <div key={name} className="flex flex-col">
            <AnnotationGroupRow
              name={name}
              count={items.length}
              color={color}
              isVisible={!hiddenClasses.includes(name)}
              onToggleVisibility={() => toggleClassVisibility(userId, name)}
              onColorChange={
                editable && color ? (color) => setClassColor(userId, name, color) : undefined
              }
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              {items.map(({ feature, index }) => {
                const id = feature.properties?.id;
                return (
                  <AnnotationThumb
                    key={id ?? index}
                    feature={feature}
                    selected={!!id && selectedIds.includes(id)}
                    color={cssColor}
                    editable={editable}
                    onSelect={(e) => select(feature, e)}
                    onZoom={() => zoomToFeature(feature)}
                    onDelete={() => deleteFeature(feature)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
