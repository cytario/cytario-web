import { Badge, IconButton, Input, Switch } from "@cytario/design";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import { UNCLASSIFIED_COLOR } from "../../state/store/slices/viewer.annotations.store";
import { RGB, RGBA } from "../../state/store/types";
import { ColorPicker, rgb } from "../ChannelsPanel/ColorPicker/ColorPicker";
import { PanelRow } from "../PanelRow";
import { Swatch } from "../Swatch";

interface AnnotationGroupRowProps {
  name: string;
  count: number;
  /** Classification color, or null for the unclassified group (no recolor). */
  color: RGB | null;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onColorChange?: (color: RGB) => void;
  /** Own set only: this group is the active class new regions are drawn into. */
  isActive?: boolean;
  /** Own set only: make this group the active class. */
  onSelectActive?: () => void;
  /** Own set only: commit an edited class name. */
  onRename?: (newName: string) => void;
  /** Own set only: delete this class (drops the registry entry, unclassifies members). */
  onDelete?: () => void;
  /** The unclassified bucket — rendered as a ghost/prompt, not a peer class. */
  isUnclassified?: boolean;
}

/**
 * Classification group header composed of the shared PanelRow: color swatch,
 * name, count, and visibility toggle, plus (own set) active-class selection —
 * the name button carries the radio semantics, the row shows the selected
 * treatment — and hover-revealed rename/delete. The unclassified group shows a
 * dashed ghost swatch and a muted italic name.
 */
export function AnnotationGroupRow({
  name,
  count,
  color,
  isVisible,
  onToggleVisibility,
  onColorChange,
  isActive,
  onSelectActive,
  onRename,
  onDelete,
  isUnclassified,
}: AnnotationGroupRowProps) {
  const swatch: RGBA = [...(color ?? UNCLASSIFIED_COLOR), 255];
  const canRecolor = color !== null && onColorChange;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onRename?.(next);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(name);
  };

  // Type scale comes from PanelRow (text-sm font-medium); only the deltas here.
  const titleCx = twMerge(
    "w-full truncate text-left text-foreground",
    isUnclassified && "italic text-muted-foreground",
  );

  return (
    <PanelRow
      selected={isActive}
      titleTruncate={!editing}
      swatch={
        canRecolor ? (
          <ColorPicker color={swatch} onColorChange={([r, g, b]) => onColorChange([r, g, b])} />
        ) : (
          // Dashed + unfilled marks the unclassified bucket.
          <Swatch
            color={isUnclassified ? undefined : rgb(swatch)}
            className={isUnclassified ? "border-dashed" : undefined}
          />
        )
      }
      title={
        editing ? (
          <Input
            size="sm"
            aria-label={`Rename ${name} class`}
            placeholder="Name this class…"
            value={draft}
            onChange={setDraft}
            // Focus the field the user just opened for rename.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
          />
        ) : onSelectActive ? (
          <button
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Draw new regions into ${name}`}
            onClick={onSelectActive}
            className={titleCx}
          >
            {name}
          </button>
        ) : (
          <span className={titleCx}>{name}</span>
        )
      }
      actions={
        !editing &&
        (onRename || onDelete) && (
          <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/panelrow:opacity-100">
            {onRename && (
              <IconButton
                icon="Pencil"
                label={`Rename ${name}`}
                variant="ghost"
                size="xs"
                onPress={startEdit}
              />
            )}
            {onDelete && (
              <IconButton
                icon="Trash2"
                label={`Delete ${name} class`}
                variant="ghost"
                size="xs"
                onPress={onDelete}
              />
            )}
          </span>
        )
      }
      value={count > 0 ? <Badge>{count}</Badge> : undefined}
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
