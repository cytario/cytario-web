/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { Radio } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

import { ColorPicker, rgb } from "./ColorPicker";
import { Switch } from "../../../../Controls";
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
      flex flex-col items-center
      focus:outline-none 
      data-[focus]:outline-1 
      data-[focus]:outline-white 
      duration-100 ease-in
      h-8
      flex items-center justify-between
      rounded-sm
      overflow-hidden
      px-2 gap-1
      border-none
      bg-slate-700 hover:bg-slate-600
      text-slate-300
      transition-colors
    `,
    isVisible && "text-white",
    isActive && "bg-slate-500",
    "group-data-[checked]/radio:opacity-50",
  );

  const disabled = !isVisible && visibleChannelCount >= MAX_VISIBLE_CHANNELS;
  let tooltip = `${isVisible ? "Hide" : "Show"} ${name}`;

  if (disabled)
    tooltip = `Only ${MAX_VISIBLE_CHANNELS} channels can be visible at once`;

  return (
    <Radio key={name} value={name} className={cx}>
      {/* Intensity Indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 ">
        {isVisible && (
          <div
            className="h-full border-r-2 border-white "
            style={{
              width: `${(pixelValue / maxDomain) * 100}%`,
              backgroundColor: rgb(color),
            }}
          />
        )}
      </div>

      {/* Main Item */}
      <div className="relative w-full flex items-center gap-2 h-full">
        {/* Color Picker */}
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ColorPicker
            color={color}
            onColorChange={onColorChange ?? (() => {})}
          />
        </div>

        {/* Item Name & Count */}
        <div className="grow">
          <div className="flex grow justify-between text-sm">
            <div className="font-bold">{name}</div>
            {pixelValue > 0 && (
              <span className="tabular-nums">{pixelValue}</span>
            )}
          </div>
        </div>

        {/* Visibility Toggle */}
        <Tooltip content={tooltip}>
          <Switch
            checked={isVisible}
            onChange={toggleChannelVisibility}
            disabled={disabled}
          />
        </Tooltip>
      </div>

      {isLoading && <LavaLoader absolute />}
    </Radio>
  );
}
