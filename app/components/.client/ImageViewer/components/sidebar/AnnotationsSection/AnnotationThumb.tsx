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
 *  with its display name below. Click selects, double-click zooms to the
 *  feature; right-click (or the focus-revealed kebab) opens the actions
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
          className="mt-1 text-right font-mono tabular-nums"
        />
      ) : (
        // w-0 + min-w-full: the name never contributes to the flex-wrap item's
        // intrinsic width, so the thumb stays exactly as wide as the geometry.
        <p className="mt-1 w-0 min-w-full text-right font-mono tabular-nums text-xs text-muted-foreground">
          <TruncatedText>{displayName}</TruncatedText>
        </p>
      )}

      {menu.menu}

      <IconButton
        icon="EllipsisVertical"
        label={`Actions for ${label}`}
        variant="ghost"
        size="xs"
        {...menu.triggerProps}
        // Desktop opens the actions via right-click; the kebab stays for
        // keyboard (revealed by focus) and is always visible on touch, which
        // has neither hover nor a secondary click. While hidden it must not
        // intercept pointer events over the thumb — opacity alone still hits.
        className={`
          absolute top-0 right-0
          opacity-0 pointer-events-none transition-opacity
          focus-within:opacity-100 focus-within:pointer-events-auto
          group-hover/thumb:opacity-100 group-hover/thumb:pointer-events-auto
          [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:pointer-events-auto
        `}
      />
    </div>
  );
};
