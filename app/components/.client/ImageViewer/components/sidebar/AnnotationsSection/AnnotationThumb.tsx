import { IconButton, Input, TruncatedText } from "@cytario/design";
import { useState } from "react";

import { annotationNameOf } from "../../../state/store/annotations/annotations.store";
import { type JoinOfferAction } from "../../annotations/joinFeatures";
import { useAnnotationContextMenu } from "../../annotations/useAnnotationContextMenu";
import { GeometrySvg } from "~/components/GeometrySvg";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface AnnotationThumbProps {
  feature: AnnotationFeature;
  selected: boolean;
  /** Classification color for the glyph, or undefined for the unclassified fallback. */
  color?: string;
  /** Connection grant permits annotating; destructive actions stay enabled. */
  editable: boolean;
  /** Existing class names offered as move targets. */
  classNames?: string[];
  onSelect: (event: React.MouseEvent) => void;
  onZoom: () => void;
  /** Assign the selection to a class. */
  onClassify?: (name: string) => void;
  /** Clear the selection's classification → Unclassified. */
  onClear?: () => void;
  /** Join offers for the action targets (see AnnotationMenuItems). */
  joinOffers?: JoinOfferAction[];
  /** Rename this annotation. */
  onRename?: (name: string) => void;
  onDelete: () => void;
}

/** A single annotation in the sidebar list: a selectable geometry thumbnail
 *  with a name strip below. Click selects, double-click zooms to the
 *  feature; right-click (or the kebab in the name strip) opens the actions
 *  menu. */
export const AnnotationThumb = ({
  feature,
  selected,
  color,
  editable,
  classNames,
  onSelect,
  onZoom,
  onClassify,
  onClear,
  joinOffers,
  onRename,
  onDelete,
}: AnnotationThumbProps) => {
  const kind = feature.geometry.type === "Point" ? "point" : "region";
  const label = `${feature.properties?.classification?.name ?? "Unclassified"} ${kind}`;
  const displayName = annotationNameOf(feature);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);

  const startEdit = () => {
    setDraft(displayName);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== displayName) onRename?.(next);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(displayName);
  };

  const menu = useAnnotationContextMenu({
    label: `Actions for ${label}`,
    editable,
    classNames,
    showRename: !!onRename,
    onZoom,
    onStartRename: startEdit,
    onClassify,
    onClear,
    joinOffers,
    onDelete,
  });

  return (
    <div
      className="group/thumb relative overflow-hidden"
      {...menu.targetProps}
      // The rename input keeps the native text menu (cut/copy/paste).
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea")) return;
        menu.targetProps.onContextMenu?.(e);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onZoom}
        className="cursor-pointer bg-muted rounded-xl overflow-hidden"
      >
        <GeometrySvg geometry={feature.geometry} color={color} selected={selected} />
      </button>

      {/* The strip is plain text — the kebab may overlay it, the thumb may not. */}
      <div
        className={
          "relative mt-1 flex flex-row items-center " +
          "transition-[padding] group-hover/thumb:pr-6 focus-within:pr-6 " +
          "[@media(pointer:coarse)]:pr-6"
        }
      >
        {editing ? (
          <Input
            size="sm"
            aria-label={`Rename ${displayName}`}
            value={draft}
            onChange={setDraft}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
            className="min-w-0 flex-1 text-left font-mono tabular-nums"
          />
        ) : (
          // w-0 + min-w-full keeps the column exactly as wide as the geometry.
          // Left-aligned so the hover-revealed kebab never shifts the text.
          <p className="w-0 min-w-full text-left font-mono tabular-nums text-xs text-muted-foreground">
            <TruncatedText>{displayName}</TruncatedText>
          </p>
        )}

        <IconButton
          icon="EllipsisVertical"
          label={`Actions for ${label}`}
          variant="ghost"
          size="xs"
          {...menu.triggerProps}
          // No layout space at rest; the strip's hover padding makes room for it.
          className={`
            absolute right-0 top-1/2 -translate-y-1/2
            opacity-0 transition-opacity
            group-hover/thumb:opacity-100
            focus-within:opacity-100
            [@media(pointer:coarse)]:opacity-100
          `}
        />
      </div>

      {menu.menu}
    </div>
  );
};
