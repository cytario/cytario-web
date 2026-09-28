import { IconButton, Input } from "@cytario/design";
import { useState } from "react";

import { annotationNameOf } from "../../../state/store/annotations/annotations.store";
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
        <p
          className="mt-1 truncate text-right font-mono tabular-nums text-xs text-muted-foreground"
          title={displayName}
        >
          {displayName}
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
        // has neither hover nor a secondary click.
        className={`
          absolute top-0 right-0
          opacity-0 transition-opacity focus-within:opacity-100
          [@media(pointer:coarse)]:opacity-100
        `}
      />
    </div>
  );
};
