import { Button, EmptyState, Input } from "@cytario/design";
import { useMemo, useRef, useState } from "react";

import { AnnotationGroupRow } from "./AnnotationGroupRow";
import { AnnotationThumb } from "./AnnotationThumb";
import { flyToFeaturesViewState } from "./flyToFeature";
import {
  classNameOf,
  isReservedClassName,
  selectUserHiddenClasses,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "../../state/store/slices/viewer.annotations.store";
import { RGB } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsPanel/ColorPicker/ColorPicker";
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
  const setClassForIds = useViewerStore((s) => s.setAnnotationClassForIds);
  const activeClass = useViewerStore((s) => s.annotationActiveClass);
  const setActiveClass = useViewerStore((s) => s.setAnnotationActiveClass);
  const renameClass = useViewerStore((s) => s.renameAnnotationClass);
  const classes = useViewerStore((s) => s.annotationClasses);
  const createClass = useViewerStore((s) => s.createAnnotationClass);
  const deleteClass = useViewerStore((s) => s.deleteAnnotationClass);
  const viewState = useViewerStore((s) => s.viewStateActive);
  const setViewState = useViewerStore((s) => s.setViewStateActive);

  // "Add class" reveals an inline name input; the class is created only on a
  // non-empty commit (no default-named placeholder is ever persisted).
  const [adding, setAdding] = useState(false);

  // Act on the current selection when the actioned feature is part of a
  // multi-selection, else on just that feature — shared by classify, delete,
  // and zoom so every row action targets the same set.
  const actionTargets = (feature: AnnotationFeature): string[] =>
    selectedIds.length > 1 && selectedIds.includes(feature.id) ? selectedIds : [feature.id];

  const annotationsGroups = useMemo<AnnotationGroup[]>(() => {
    const byName = new Map<string, AnnotationGroup>();
    // Own set: always show the Unclassified bucket, pinned first — the default
    // draw target — then every defined class (registry), so empty classes show.
    if (editable) {
      byName.set(UNCLASSIFIED, { name: UNCLASSIFIED, color: null, items: [] });
      for (const c of classes) byName.set(c.name, { name: c.name, color: c.color, items: [] });
    }
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
  }, [features, editable, classes]);

  // Existing named classes offered as move targets (the unclassified bucket is
  // reached via "Clear classification", not a move).
  const namedClasses = useMemo(
    () => annotationsGroups.map((g) => g.name).filter((name) => !isReservedClassName(name)),
    [annotationsGroups],
  );

  // Flattened ids in displayed (grouped) order — the axis a Shift-range walks.
  const orderedIds = useMemo(
    () =>
      annotationsGroups.flatMap(
        (g) => g.items.map((it) => it.feature.id).filter(Boolean) as string[],
      ),
    [annotationsGroups],
  );

  // Last item selected without Shift — the fixed end of a range extension.
  const anchorId = useRef<string | null>(null);

  const select = (feature: AnnotationFeature, e?: MouseEvent | React.MouseEvent) => {
    const id = feature.id;
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
    // Zoom to the whole selection (combined bounds) when the actioned region is
    // part of it, else to just that region — same target rule as classify.
    // Select without routing through select() — zoom is navigation, not a
    // selection gesture, so it must not move the Shift-range anchor.
    const ids = new Set(actionTargets(feature));
    setSelectedIds([...ids]);
    if (!viewState) return;
    const geometries = features.filter((f) => ids.has(f.id)).map((f) => f.geometry);
    const next = flyToFeaturesViewState(geometries, viewState);
    if (next) setViewState(next);
  };

  const deleteFeatures = (feature: AnnotationFeature) => {
    // Delete the whole selection when the actioned region is part of it, else
    // just that region — same target rule as classify.
    const ids = new Set(actionTargets(feature));
    setSelectedIds([]);
    anchorId.current = null;
    updateUserFeatures(
      userId,
      features.filter((f) => !ids.has(f.id)),
    );
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {annotationsGroups.map(({ name, color, items }) => {
        const cssColor = rgb([...(color ?? UNCLASSIFIED_COLOR), 255]);
        const isUnclassified = isReservedClassName(name);
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
              isActive={editable && (isUnclassified ? activeClass === null : activeClass === name)}
              onSelectActive={
                editable ? () => setActiveClass(isUnclassified ? null : name) : undefined
              }
              onRename={
                // Named classes only — new classes are created via "Add class",
                // so the Unclassified bucket is never renamed.
                editable && !isUnclassified
                  ? (newName) => renameClass(userId, name, newName)
                  : undefined
              }
              onDelete={editable && !isUnclassified ? () => deleteClass(userId, name) : undefined}
              isUnclassified={isUnclassified}
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              {items.map(({ feature, index }) => {
                const id = feature.id;
                return (
                  <AnnotationThumb
                    key={id ?? index}
                    feature={feature}
                    selected={!!id && selectedIds.includes(id)}
                    color={cssColor}
                    editable={editable}
                    // Don't offer moving into the group the region already sits in.
                    classNames={namedClasses.filter((n) => n !== name)}
                    onSelect={(e) => select(feature, e)}
                    onZoom={() => zoomToFeature(feature)}
                    onClassify={(className) =>
                      setClassForIds(userId, actionTargets(feature), className)
                    }
                    // Already-unclassified regions have nothing to clear.
                    onClear={
                      isUnclassified
                        ? undefined
                        : () => setClassForIds(userId, actionTargets(feature), null)
                    }
                    onDelete={() => deleteFeatures(feature)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {editable &&
        (adding ? (
          <NewClassInput
            onCommit={(className) => {
              createClass(className);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button size="sm" variant="ghost" onPress={() => setAdding(true)} iconLeft="Plus">
            Add class
          </Button>
        ))}

      {editable && features.length === 0 && (
        <EmptyState
          title="No annotations yet"
          description="Select a class above, then use the draw tools to add your first region."
          icon="Spline"
          className="py-4"
        />
      )}
    </div>
  );
};

/** Inline name field for creating a class — commits on a non-empty Enter/blur,
 *  cancels (creating nothing) on empty or Escape. */
function NewClassInput({
  onCommit,
  onCancel,
}: {
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  // Enter and blur can both fire on the same interaction; settle once so the
  // class isn't created twice.
  const settled = useRef(false);
  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };
  const commit = () => {
    const name = draft.trim();
    settle(() => (name ? onCommit(name) : onCancel()));
  };
  return (
    <Input
      size="sm"
      aria-label="New class name"
      placeholder="Name this class…"
      value={draft}
      onChange={setDraft}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") settle(onCancel);
      }}
    />
  );
}
