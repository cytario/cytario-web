import { IconButton, Input, Switch } from "@cytario/design";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import { UNCLASSIFIED_COLOR } from "../../state/store/slices/viewer.annotations.store";
import { RGB, RGBA } from "../../state/store/types";
import { ColorPicker, rgb } from "../ChannelsPanel/ColorPicker/ColorPicker";

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
  /** Own set only: commit an edited class name — rename, or name the unclassified bucket. */
  onRename?: (newName: string) => void;
  /** Own set only: delete this class (drops the registry entry, unclassifies members). */
  onDelete?: () => void;
  /** The unclassified bucket — rendered as a ghost/prompt, not a peer class. */
  isUnclassified?: boolean;
}

/**
 * Classification group header: color swatch + name + count + visibility toggle,
 * plus (own set) active-class selection and inline rename. Reuses the channel
 * controller's `ColorPicker` and the design-system `Switch`. The unclassified
 * group shows a dashed ghost swatch and a muted "name this class" affordance.
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

  return (
    <div
      className={twMerge(
        "group/grouprow flex items-center gap-2 rounded border-l-2 border-transparent px-1 py-1",
        isActive && "border-primary bg-muted",
      )}
    >
      {onSelectActive && (
        <button
          type="button"
          role="radio"
          aria-checked={isActive}
          aria-label={`Draw new regions into ${name}`}
          onClick={onSelectActive}
          className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border"
        >
          {isActive && <span className="size-2 rounded-full bg-primary" aria-hidden />}
        </button>
      )}

      {canRecolor ? (
        <ColorPicker color={swatch} onColorChange={([r, g, b]) => onColorChange([r, g, b])} />
      ) : (
        <span
          className={twMerge(
            "size-3 shrink-0 rounded-sm border border-border",
            isUnclassified && "border-dashed",
          )}
          style={isUnclassified ? undefined : { backgroundColor: rgb(swatch) }}
          aria-hidden
        />
      )}

      {editing ? (
        <div className="flex-1">
          <Input
            size="sm"
            aria-label={isUnclassified ? "Name this class" : `Rename ${name} class`}
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
        </div>
      ) : onSelectActive ? (
        <button
          type="button"
          onClick={onSelectActive}
          className={twMerge(
            "flex-1 truncate text-left text-xs font-medium text-foreground",
            isUnclassified && "italic text-muted-foreground",
          )}
        >
          {name}
        </button>
      ) : (
        <span
          className={twMerge(
            "flex-1 truncate text-xs font-medium text-foreground",
            isUnclassified && "italic text-muted-foreground",
          )}
        >
          {name}
        </span>
      )}

      {!editing && (onRename || onDelete) && (
        <span className="flex opacity-0 transition-opacity group-hover/grouprow:opacity-100 focus-within:opacity-100">
          {onRename && (
            <IconButton
              icon="Pencil"
              label={isUnclassified ? "Name this class" : `Rename ${name}`}
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
      )}

      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      <Switch
        isSelected={isVisible}
        onChange={onToggleVisibility}
        color={rgb(swatch)}
        aria-label={`Toggle ${name} visibility`}
      />
    </div>
  );
}
