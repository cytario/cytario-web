import { IconButton, Menu, MenuItem, Switch } from "@cytario/design";
import { useRef } from "react";

import { UNCLASSIFIED_COLOR } from "../../../state/store/annotations/annotations.store";
import { RGB } from "../../../state/store/types";
import { rgb } from "../SectionRow/ColorPicker/ColorPicker";
import { SectionRow, type SectionRowHandle } from "../SectionRow/SectionRow";

interface AnnotationGroupRowProps {
  name: string;
  count: number;
  /** Classification color, or null for the unclassified group (no recolor). */
  color: RGB | null;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onColorChange?: (color: RGB) => void;
  /** Own set only: this group is the active class new regions are drawn into. */
  isSelected?: boolean;
  /** Own set only: commit an edited class name. */
  onRename?: (newName: string) => void;
  /** Own set only: delete this class (drops the registry entry, unclassifies members). */
  onDelete?: () => void;
}

/**
 * Classification group header composed of the shared SectionRow: color swatch,
 * name, count, and visibility toggle, plus a hover-revealed actions menu
 * (rename/delete, own set only). The unclassified group shows a dashed ghost
 * swatch. Active-class selection is the caller's row-level radio wrapper.
 */
export function AnnotationGroupRow({
  name,
  count,
  color,
  isVisible,
  onToggleVisibility,
  onColorChange,
  isSelected,
  onRename,
  onDelete,
}: AnnotationGroupRowProps) {
  const swatch: RGB = color ?? UNCLASSIFIED_COLOR;
  const canRecolor = color !== null && onColorChange;
  const sectionRowRef = useRef<SectionRowHandle>(null);

  return (
    <SectionRow
      ref={sectionRowRef}
      isSelected={isSelected}
      colors={[swatch]}
      onColorChange={canRecolor ? onColorChange : undefined}
      title={name}
      onRename={onRename}
      actions={
        (onRename || onDelete) && (
          <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/controlrow:opacity-100">
            <Menu
              content={
                <>
                  {onRename && (
                    <MenuItem
                      id="rename"
                      icon="Pencil"
                      onAction={() => sectionRowRef.current?.startRename()}
                    >
                      Rename
                    </MenuItem>
                  )}
                  {onDelete && (
                    <MenuItem id="delete" icon="Trash2" isDanger onAction={onDelete}>
                      Delete
                    </MenuItem>
                  )}
                </>
              }
            >
              <IconButton
                icon="EllipsisVertical"
                label={`Actions for ${name} class`}
                variant="ghost"
                size="xs"
              />
            </Menu>
          </span>
        )
      }
      count={count}
      toggle={
        <Switch
          isSelected={isVisible}
          isDisabled={count === 0}
          onChange={onToggleVisibility}
          color={rgb(swatch)}
          aria-label={`Toggle ${name} visibility`}
        />
      }
    />
  );
}
