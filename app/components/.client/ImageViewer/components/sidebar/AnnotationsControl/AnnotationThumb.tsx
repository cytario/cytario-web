import { IconButton, Input, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import { useState } from "react";

import { annotationNameOf } from "../../../state/store/slices/viewer.annotations.store";
import { GeometrySvg } from "~/components/GeometrySvg";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface AnnotationThumbProps {
  feature: AnnotationFeature;
  selected: boolean;
  /** Classification color for the glyph, or undefined for the unclassified fallback. */
  color?: string;
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
 *  feature; the hover/focus-revealed kebab opens the actions menu. */
export const AnnotationThumb = ({
  feature,
  selected,
  color,
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

  return (
    <div className="group/thumb relative overflow-hidden">
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

      <Menu
        content={
          <>
            <MenuItem id="zoom" icon="ZoomIn" onAction={onZoom}>
              Zoom to annotation
            </MenuItem>
            {onRename && (
              <MenuItem id="rename" icon="Pencil" onAction={startEdit}>
                Rename annotation
              </MenuItem>
            )}
            {onClassify && ((classNames?.length ?? 0) > 0 || onClear) && (
              <>
                <MenuSeparator />
                {(classNames ?? []).map((name) => (
                  <MenuItem
                    key={name}
                    id={`move:${name}`}
                    icon="Tag"
                    onAction={() => onClassify(name)}
                  >
                    Move to {name}
                  </MenuItem>
                ))}
                {onClear && (
                  <MenuItem id="unclassify" icon="X" onAction={onClear}>
                    Clear classification
                  </MenuItem>
                )}
              </>
            )}
            <MenuSeparator />
            <MenuItem id="delete" icon="Trash2" isDanger onAction={onDelete}>
              Delete annotation
            </MenuItem>
          </>
        }
      >
        <IconButton
          icon="EllipsisVertical"
          label={`Actions for ${label}`}
          variant="ghost"
          size="xs"
          // Show on thumb hover or keyboard focus-within, so the actions stay discoverable without cluttering every thumbnail.
          className={`
            absolute top-0 right-0
            opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-within:opacity-100
          `}
        />
      </Menu>
    </div>
  );
};
