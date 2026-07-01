import { Switch } from "@cytario/design";

import { UNCLASSIFIED_COLOR } from "../../state/store/slices/viewer.annotations.store";
import { RGB, RGBA } from "../../state/store/types";
import { ColorPicker, rgb } from "../ChannelsController/ColorPicker/ColorPicker";

interface AnnotationGroupRowProps {
  name: string;
  count: number;
  /** Classification color, or null for the unclassified group (no recolor). */
  color: RGB | null;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onColorChange?: (color: RGB) => void;
}

/**
 * Classification group header: color dot + name + count + visibility toggle.
 * Reuses the channel controller's `ColorPicker` and the design-system `Switch`
 * (the building blocks of `ChannelsControllerItem`, without its radio/channel
 * coupling). The unclassified group shows a static dot — no class to recolor.
 */
export function AnnotationGroupRow({
  name,
  count,
  color,
  isVisible,
  onToggleVisibility,
  onColorChange,
}: AnnotationGroupRowProps) {
  const swatch: RGBA = [...(color ?? UNCLASSIFIED_COLOR), 255];
  const canRecolor = color !== null && onColorChange;

  return (
    <div className="flex items-center gap-2 py-1">
      {canRecolor ? (
        <ColorPicker color={swatch} onColorChange={([r, g, b]) => onColorChange([r, g, b])} />
      ) : (
        <span
          className="size-3 shrink-0 rounded-sm border border-border"
          style={{ backgroundColor: rgb(swatch) }}
          aria-hidden
        />
      )}
      <span className="flex-1 truncate text-xs font-medium text-foreground">{name}</span>
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
