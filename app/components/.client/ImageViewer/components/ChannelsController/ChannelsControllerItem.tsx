/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { Switch } from "@cytario/design";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { ColorPicker, rgb } from "./ColorPicker";
import { select } from "../../state/selectors";
import { ChannelsStateColumns, RGBA } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { LavaLoader } from "~/components/LavaLoader";
import { Tooltip } from "~/components/Tooltip/Tooltip";

// viv library only supports 6 channels
// See: https://github.com/hms-dbmi/viv/issues/687
const MAX_VISIBLE_CHANNELS = 6;

interface ChannelsControllerItemProps {
  name: keyof ChannelsStateColumns;
  color: RGBA;
  isVisible: boolean;
  isLoading: boolean;
  pixelValue: number;
  maxDomain: number;
  visibleChannelCount?: number;
  toggleChannelVisibility: () => void;
  onColorChange?: (color: RGBA) => void;
}

/** Individual channel row in the ChannelsController. Displays color dot, name, pixel value, visibility toggle, and a loading overlay. */
export function ChannelsControllerItem({
  name,
  isVisible,
  isLoading,
  color,
  pixelValue,
  maxDomain,
  visibleChannelCount = 0,
  toggleChannelVisibility,
  onColorChange,
}: ChannelsControllerItemProps) {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const isActive = selectedChannelId === name;

  const cx = twMerge(
    `
      group/radio
      cursor-pointer
      relative
      flex items-center gap-2
      focus:outline-none
      data-[focus]:outline-1
      data-[focus]:outline-[var(--color-text-primary)]
      py-2
      border-b border-[var(--color-surface-subtle)]
      text-[var(--color-text-secondary)]
      transition-colors
      border-none
    `,
    isVisible && "text-[var(--color-text-primary)]",
    isActive && "bg-[var(--color-surface-subtle)]",
  );

  const disabled = !isVisible && visibleChannelCount >= MAX_VISIBLE_CHANNELS;
  let tooltip = `${isVisible ? "Hide" : "Show"} ${name}`;

  if (disabled)
    tooltip = `Only ${MAX_VISIBLE_CHANNELS} channels can be visible at once`;

  return (
    <Radio key={name} value={name} className={cx}>
      {/* Intensity Indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5">
        {isVisible && (
          <div
            className="h-full"
            style={{
              width: `${(pixelValue / maxDomain) * 100}%`,
              backgroundColor: rgb(color),
            }}
          />
        )}
      </div>

      {/* Color Picker (dot) */}
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ColorPicker
          color={color}
          onColorChange={onColorChange ?? (() => {})}
        />
      </div>

      {/* Channel Name */}
      <span className="flex-1 text-sm truncate">{name}</span>

      {/* Pixel Value */}
      {pixelValue > 0 && (
        <span className="text-xs tabular-nums text-(--color-text-secondary)">
          {pixelValue}
        </span>
      )}

      {/* Visibility Toggle */}
      <Tooltip content={tooltip}>
        <Switch
          isSelected={isVisible}
          onChange={() => toggleChannelVisibility()}
          color={rgb(color)}
          isDisabled={disabled}
        />
      </Tooltip>

      {isLoading && <LavaLoader absolute rows={1} cols={6} />}
    </Radio>
  );
}
