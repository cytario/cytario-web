import { Switch, Tooltip } from "@cytario/design";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { ColorPicker, rgb } from "./ColorPicker/ColorPicker";
import { select } from "../../state/store/selectors";
import { ChannelsStateColumns, RGBA } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { PanelRow } from "../PanelRow";
import { LavaLoader } from "~/components/LavaLoader";

// viv library only supports 6 channels
// See: https://github.com/hms-dbmi/viv/issues/687
const MAX_VISIBLE_CHANNELS = 6;

interface ChannelsPanelItemProps {
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

/** Individual channel row in the ChannelsPanel: a RAC Radio (channel selection)
 *  wrapping the shared PanelRow — color picker, name, pixel value, visibility
 *  toggle, intensity bar and loading overlay. */
export function ChannelsPanelItem({
  name,
  isVisible,
  isLoading,
  color,
  pixelValue,
  maxDomain,
  visibleChannelCount = 0,
  toggleChannelVisibility,
  onColorChange,
}: ChannelsPanelItemProps) {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const isActive = selectedChannelId === name;

  const cx = twMerge(
    `
      group/radio
      cursor-pointer
      focus:outline-none
      focus-visible:outline-1
      focus-visible:outline-foreground
      text-muted-foreground
      transition-colors
    `,
    isVisible && "text-foreground",
  );

  const disabled = !isVisible && visibleChannelCount >= MAX_VISIBLE_CHANNELS;
  let tooltip = `${isVisible ? "Hide" : "Show"} ${name}`;

  if (disabled) tooltip = `Only ${MAX_VISIBLE_CHANNELS} channels can be visible at once`;

  return (
    <Radio key={name} value={name} className={cx}>
      <PanelRow
        selected={isActive}
        accessory={
          <>
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
            {isLoading && <LavaLoader absolute rows={1} cols={6} />}
          </>
        }
        swatch={
          // Picker is RGB; the channel color keeps its alpha across a recolor.
          <ColorPicker
            color={[color[0], color[1], color[2]]}
            onColorChange={onColorChange ? (c) => onColorChange([...c, color[3]]) : undefined}
          />
        }
        title={name}
        count={pixelValue > 0 ? pixelValue : undefined}
        toggle={
          <Tooltip content={tooltip}>
            <Switch
              isSelected={isVisible}
              onChange={() => toggleChannelVisibility()}
              color={rgb(color)}
              isDisabled={disabled}
            />
          </Tooltip>
        }
      />
    </Radio>
  );
}
