import { IconButton, MenuItem, MenuSeparator, useContextMenu } from "@cytario/design";

import { GeometrySvg } from "~/components/GeometrySvg";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface AnnotationThumbProps {
  feature: AnnotationFeature;
  selected: boolean;
  /** Classification color for the glyph, or undefined for the unclassified fallback. */
  color?: string;
  /** Own set → destructive actions enabled; peers are read-only. */
  editable: boolean;
  /** Existing class names offered as move targets (own set only). */
  classNames?: string[];
  onSelect: (event: React.MouseEvent) => void;
  onZoom: () => void;
  /** Assign the selection to a class (own set only). */
  onClassify?: (name: string) => void;
  /** Clear the selection's classification → Unclassified (own set only). */
  onClear?: () => void;
  onDelete: () => void;
}

/** A single annotation in the sidebar list: a selectable geometry thumbnail.
 *  Click selects, double-click zooms to the feature, right-click (or the
 *  hover/focus-revealed kebab, for keyboard) opens the actions menu. */
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
  onDelete,
}: AnnotationThumbProps) => {
  // Accessible name: the thumbnail is otherwise a bare geometry with no text.
  const kind = feature.geometry.type === "Point" ? "point" : "region";
  const label = `${feature.properties?.classification?.name ?? "Unclassified"} ${kind}`;

  const { targetProps, triggerProps, menu } = useContextMenu({
    content: (
      <>
        <MenuItem id="zoom" icon="ZoomIn" onAction={onZoom}>
          Zoom to annotation
        </MenuItem>
        {editable && onClassify && ((classNames?.length ?? 0) > 0 || onClear) && (
          <>
            <MenuSeparator />
            {(classNames ?? []).map((name) => (
              <MenuItem key={name} id={`move:${name}`} icon="Tag" onAction={() => onClassify(name)}>
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
        <MenuItem id="delete" icon="Trash2" isDanger isDisabled={!editable} onAction={onDelete}>
          Delete annotation
        </MenuItem>
      </>
    ),
  });

  return (
    <div className="group/thumb relative" {...targetProps}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onZoom}
        className={`
          rounded-2xl
          border border-border
          text-muted-foreground hover:text-foreground
          overflow-hidden
        `}
      >
        <GeometrySvg geometry={feature.geometry} color={color} selected={selected} />
      </button>

      <IconButton
        {...triggerProps}
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
      {menu}
    </div>
  );
};
