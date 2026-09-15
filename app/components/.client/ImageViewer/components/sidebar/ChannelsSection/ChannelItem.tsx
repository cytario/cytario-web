import { Switch, Tooltip } from "@cytario/design";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { MAX_VISIBLE_CHANNELS } from "./constants";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { ChannelsStateColumns, RGBA } from "../../../state/store/types";
import { rgb } from "../SectionRow/ColorPicker/ColorPicker";
import { SectionRow } from "../SectionRow/SectionRow";

interface ChannelItemProps {
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

/** Individual channel row in the ChannelsSection: a RAC Radio (channel selection)
 *  wrapping the shared SectionRow — color picker, name, pixel value, visibility
 *  toggle, intensity bar and loading overlay. */
export function ChannelItem({
  name,
  isVisible,
  isLoading,
  color,
  pixelValue,
  maxDomain,
  visibleChannelCount = 0,
  toggleChannelVisibility,
  onColorChange,
}: ChannelItemProps) {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const isActive = selectedChannelId === name;

  const cx = twMerge(
    `
      group/radio
      cursor-pointer
      text-muted-foreground
      focus:outline-none
      focus-visible:outline-1
      focus-visible:outline-foreground
      transition-colors
    `,
    isVisible && "text-foreground",
  );

  const disabled = !isVisible && visibleChannelCount >= MAX_VISIBLE_CHANNELS;
  let tooltip = `${isVisible ? "Hide" : "Show"} ${name}`;

  if (disabled) tooltip = `Only ${MAX_VISIBLE_CHANNELS} channels can be visible at once`;

  return (
    <Radio key={name} value={name} className={cx}>
      <SectionRow
        selected={isActive}
        isLoading={isLoading}
        count={pixelValue > 0 ? pixelValue : undefined}
        countMax={isVisible ? maxDomain : undefined}
        colors={[color]}
        onColorChange={onColorChange}
        colorLabel={`${name} color`}
        title={name}
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
