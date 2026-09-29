import { Button, EmptyState, Input } from "@cytario/design";
import { Fragment, useMemo, useRef, useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";

import { AnnotationGroupRow } from "./AnnotationGroupRow";
import { AnnotationThumb } from "./AnnotationThumb";
import { groupAnnotations } from "./groupAnnotations";
import {
  isReservedClassName,
  selectSetHiddenClasses,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "../../../state/store/annotations/annotations.store";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { joinOffersForFeatures } from "../../annotations/joinFeatures";
import { useAnnotationFeatureActions } from "../../annotations/useAnnotationFeatureActions";
import { rgb } from "../SectionRow/ColorPicker/ColorPicker";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface AnnotationsListProps {
  setId: string;
  features: AnnotationFeature[];
  /** Connection grant permits annotating — class authoring, rename, and
   *  delete stay available. Read-only grants keep the list view-only. */
  editable: boolean;
  searchQuery: string;
  /** Section-wide id order across every set block — the axis a Shift-range
   *  walks, so ranges span set boundaries along the displayed order. */
  selectionOrderedIds: string[];
}

/** Groups one set's annotation features by classification (with an
 *  `Unclassified` fallback). Each group can be shown/hidden and (when
 *  editable) recolored; a thumbnail click selects + flies to the feature. */
export const AnnotationsList = ({
  setId,
  features,
  editable,
  searchQuery,
  selectionOrderedIds,
}: AnnotationsListProps) => {
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const applyAnnotationSelection = useViewerStore((s) => s.applyAnnotationSelection);
  const hiddenClasses = useViewerStore(selectSetHiddenClasses(setId));
  const toggleClassVisibility = useViewerStore((s) => s.toggleAnnotationClassVisibility);
  const setClassColor = useViewerStore((s) => s.setAnnotationClassColor);
  const activeClass = useViewerStore((s) => s.annotationActiveClass);
  const setActiveClass = useViewerStore((s) => s.setAnnotationActiveClass);
  const renameClass = useViewerStore((s) => s.renameAnnotationClass);
  const renameAnnotation = useViewerStore((s) => s.renameAnnotation);
  const classes = useViewerStore((s) => s.annotationClasses);
  const createClass = useViewerStore((s) => s.createAnnotationClass);
  const deleteClass = useViewerStore((s) => s.deleteAnnotationClass);
  const { actionTargets, zoomToFeature, deleteFeatures, classify, clearClass, joinIds } =
    useAnnotationFeatureActions({
      setId,
      features,
    });

  // "Add class" reveals an inline name input; the class is created only on a
  // non-empty commit (no default-named placeholder is ever persisted).
  const [adding, setAdding] = useState(false);

  // Collapsed class groups (session-local) — a non-empty search expands all.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (name: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const annotationsGroups = useMemo(
    () => groupAnnotations(features, { editable, classes, searchQuery }),
    [features, editable, classes, searchQuery],
  );

  // Existing named classes offered as move targets (the unclassified bucket is
  // reached via "Clear classification", not a move).
  const namedClasses = useMemo(
    () => annotationsGroups.map((g) => g.name).filter((name) => !isReservedClassName(name)),
    [annotationsGroups],
  );

  // Last item selected without Shift — the fixed end of a range extension.
  // Held in the shared store so the anchor survives across set blocks and a
  // Shift-range can span them.
  const anchorId = useViewerStore((s) => s.annotationSelectionAnchorId);

  const select = (feature: AnnotationFeature, e?: MouseEvent | React.MouseEvent) => {
    const id = feature.id;
    if (!id) {
      applyAnnotationSelection([], {});
      return;
    }

    if (e?.shiftKey && anchorId) {
      const from = selectionOrderedIds.indexOf(anchorId);
      const to = selectionOrderedIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        // Range select: the anchor stays where it was.
        applyAnnotationSelection(selectionOrderedIds.slice(lo, hi + 1), {});
        return;
      }
    }

    // Cmd/Ctrl+click: toggle the clicked item in/out; the anchor moves to it.
    if (e && (e.metaKey || e.ctrlKey)) {
      applyAnnotationSelection([id], { toggle: true, anchor: id });
      return;
    }

    applyAnnotationSelection([id], { anchor: id });
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
              // A search expands every group, else matches hide behind collapsed rows.
              accordionOpen={!collapsedGroups.has(name) || searchQuery.length > 0}
              onToggleAccordion={() => toggleGroup(name)}
            />
          );
          const isCollapsed = collapsedGroups.has(name) && searchQuery.length === 0;
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

              {!isCollapsed && (
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
                        joinOffers={
                          editable
                            ? joinOffersForFeatures(
                                actionTargets(feature)
                                  .map((id) => features.find((f) => f.id === id))
                                  .filter((f): f is AnnotationFeature => !!f),
                              ).map((offer) => ({
                                ...offer,
                                onJoin: () => joinIds(offer.ids),
                              }))
                            : undefined
                        }
                        onClassify={(className) => classify(feature, className)}
                        // Already-unclassified regions have nothing to clear.
                        onClear={isUnclassified ? undefined : () => clearClass(feature)}
                        onRename={
                          editable ? (name) => renameAnnotation(setId, feature.id, name) : undefined
                        }
                        onDelete={() => deleteFeatures(feature)}
                      />
                    );
                  })}
                </div>
              )}
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
