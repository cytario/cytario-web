import { Button, EmptyState, Input } from "@cytario/design";
import { Fragment, useMemo, useRef, useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";

import { AnnotationGroupRow } from "./AnnotationGroupRow";
import { AnnotationThumb } from "./AnnotationThumb";
import { flyToFeaturesViewState } from "./flyToFeature";
import {
  annotationNameOf,
  classNameOf,
  isReservedClassName,
  selectSetHiddenClasses,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "../../../state/store/annotations/annotations.store";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { RGB } from "../../../state/store/types";
import { rgb } from "../SectionRow/ColorPicker/ColorPicker";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface AnnotationGroup {
  name: string;
  color: RGB | null;
  items: { feature: AnnotationFeature; index: number }[];
}

interface AnnotationsListProps {
  setId: string;
  features: AnnotationFeature[];
  /** Connection grant permits annotating — class authoring, rename, and
   *  delete stay available. Read-only grants keep the list view-only. */
  editable: boolean;
  searchQuery: string;
}

/** Groups one set's annotation features by classification (with an
 *  `Unclassified` fallback). Each group can be shown/hidden and (when
 *  editable) recolored; a thumbnail click selects + flies to the feature. */
export const AnnotationsList = ({
  setId,
  features,
  editable,
  searchQuery,
}: AnnotationsListProps) => {
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const updateSetFeatures = useViewerStore((s) => s.updateSetFeatures);
  const hiddenClasses = useViewerStore(selectSetHiddenClasses(setId));
  const toggleClassVisibility = useViewerStore((s) => s.toggleAnnotationClassVisibility);
  const setClassColor = useViewerStore((s) => s.setAnnotationClassColor);
  const setClassForIds = useViewerStore((s) => s.setAnnotationClassForIds);
  const activeClass = useViewerStore((s) => s.annotationActiveClass);
  const setActiveClass = useViewerStore((s) => s.setAnnotationActiveClass);
  const renameClass = useViewerStore((s) => s.renameAnnotationClass);
  const renameAnnotation = useViewerStore((s) => s.renameAnnotation);
  const duplicateAnnotations = useViewerStore((s) => s.duplicateAnnotations);
  const classes = useViewerStore((s) => s.annotationClasses);
  const createClass = useViewerStore((s) => s.createAnnotationClass);
  const deleteClass = useViewerStore((s) => s.deleteAnnotationClass);
  const viewState = useViewerStore((s) => s.viewStateActive);
  const setViewState = useViewerStore((s) => s.setViewStateActive);

  // "Add class" reveals an inline name input; the class is created only on a
  // non-empty commit (no default-named placeholder is ever persisted).
  const [adding, setAdding] = useState(false);

  // Act on the current selection when the actioned feature is part of it, else on
  // just that feature — shared by classify, delete, duplicate, and zoom.
  const actionTargets = (feature: AnnotationFeature): string[] =>
    selectedIds.length > 1 && selectedIds.includes(feature.id) ? selectedIds : [feature.id];

  const annotationsGroups = useMemo<AnnotationGroup[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = (feature: AnnotationFeature) =>
      query.length === 0 || annotationNameOf(feature).toLowerCase().includes(query);

    const byName = new Map<string, AnnotationGroup>();
    // When authoring: seed the Unclassified bucket (the default draw target) and every
    // defined class so empty classes show; read-only grants and searches skip that.
    if (editable && query.length === 0) {
      byName.set(UNCLASSIFIED, { name: UNCLASSIFIED, color: null, items: [] });
      for (const c of classes) byName.set(c.name, { name: c.name, color: c.color, items: [] });
    }
    features.forEach((feature, index) => {
      if (!matches(feature)) return;
      const name = classNameOf(feature);
      let group = byName.get(name);
      if (!group) {
        group = { name, color: feature.properties?.classification?.color ?? null, items: [] };
        byName.set(name, group);
      }
      group.items.push({ feature, index });
    });
    return [...byName.values()];
  }, [features, editable, classes, searchQuery]);

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

    setSelectedIds([id]);
    anchorId.current = id;
  };

  const zoomToFeature = (feature: AnnotationFeature) => {
    // Select without routing through select() — zoom is navigation, not a selection
    // gesture, so it must not move the Shift-range anchor.
    const ids = new Set(actionTargets(feature));
    setSelectedIds([...ids]);
    if (!viewState) return;
    const geometries = features.filter((f) => ids.has(f.id)).map((f) => f.geometry);
    const next = flyToFeaturesViewState(geometries, viewState);
    if (next) setViewState(next);
  };

  const deleteFeatures = (feature: AnnotationFeature) => {
    const ids = new Set(actionTargets(feature));
    setSelectedIds([]);
    anchorId.current = null;
    updateSetFeatures(
      setId,
      features.filter((f) => !ids.has(f.id)),
    );
  };

  const duplicateFeatures = (feature: AnnotationFeature) => {
    const ids = new Set(actionTargets(feature));
    duplicateAnnotations(
      setId,
      features.filter((f) => ids.has(f.id)),
    );
  };

  // Active-class selection is a single-select radio group; read-only grants get no
  // group — the headers render plainly.
  const GroupContainer = (editable ? RadioGroup : Fragment) as React.ComponentType<{
    children?: React.ReactNode;
    "aria-label"?: string;
    value?: string;
    onChange?: (value: string) => void;
    className?: string;
  }>;

  return (
    // gap-1 between group rows (the shared row rhythm); the larger gap-2 stays
    // between a group header and its thumbnail grid.
    <div className="flex flex-col gap-2">
      <GroupContainer
        {...(editable
          ? {
              "aria-label": "Annotation classes",
              value: activeClass ?? UNCLASSIFIED,
              onChange: (v: string) => setActiveClass(v === UNCLASSIFIED ? null : v),
              className: "contents",
            }
          : {})}
      >
        {annotationsGroups.map(({ name, color, items }) => {
          const cssColor = rgb([...(color ?? UNCLASSIFIED_COLOR), 255]);
          const isUnclassified = isReservedClassName(name);
          const header = (
            <AnnotationGroupRow
              name={name}
              count={items.length}
              color={color}
              isVisible={!hiddenClasses.includes(name)}
              onToggleVisibility={() => toggleClassVisibility(setId, name)}
              onColorChange={
                editable && color ? (color) => setClassColor(setId, name, color) : undefined
              }
              isSelected={
                editable && (isUnclassified ? activeClass === null : activeClass === name)
              }
              onRename={
                // Named classes only — new classes are created via "Add class",
                // so the Unclassified bucket is never renamed.
                editable && !isUnclassified
                  ? (newName) => renameClass(setId, name, newName)
                  : undefined
              }
              onDelete={editable && !isUnclassified ? () => deleteClass(setId, name) : undefined}
            />
          );
          return (
            <div key={name} className="flex flex-col gap-2">
              {editable ? (
                <Radio
                  value={isUnclassified ? UNCLASSIFIED : name}
                  aria-label={`Draw new regions into ${name}`}
                  className="group/radio cursor-pointer focus:outline-none focus-visible:outline-1 focus-visible:outline-foreground transition-colors"
                >
                  {header}
                </Radio>
              ) : (
                header
              )}

              <div className="flex flex-wrap gap-2">
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
                        setClassForIds(setId, actionTargets(feature), className)
                      }
                      // Already-unclassified regions have nothing to clear.
                      onClear={
                        isUnclassified
                          ? undefined
                          : () => setClassForIds(setId, actionTargets(feature), null)
                      }
                      onRename={
                        editable ? (name) => renameAnnotation(setId, feature.id, name) : undefined
                      }
                      onDuplicate={editable ? () => duplicateFeatures(feature) : undefined}
                      onDelete={() => deleteFeatures(feature)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </GroupContainer>

      {editable &&
        searchQuery.trim().length === 0 &&
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

      {editable && features.length === 0 && searchQuery.trim().length === 0 && (
        <EmptyState
          title="No annotations yet"
          description="Select a class above, then use the draw tools to add your first region."
          icon="Spline"
          className="py-4"
        />
      )}

      {searchQuery.trim().length > 0 && annotationsGroups.every((g) => g.items.length === 0) && (
        <EmptyState
          title="No matching annotations"
          description={`No annotations match "${searchQuery.trim()}".`}
          icon="Search"
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
