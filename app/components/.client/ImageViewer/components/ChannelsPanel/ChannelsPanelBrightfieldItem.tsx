import { Switch, Tooltip } from "@cytario/design";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { select } from "../../state/store/selectors";
import { BRIGHTFIELD_GROUP_ID } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { PanelRow } from "../PanelRow";
import { LavaLoader } from "~/components/LavaLoader";

// viv library only supports 6 channels
// Brightfield uses 3 of those slots
const MAX_VISIBLE_CHANNELS = 6;
const BRIGHTFIELD_CHANNEL_COUNT = 3;

interface ChannelsPanelBrightfieldItemProps {
  isVisible: boolean;
  isLoading: boolean;
  visibleChannelCount: number;
  toggleVisibility: () => void;
}

export function ChannelsPanelBrightfieldItem({
  isVisible,
  isLoading,
  visibleChannelCount,
  toggleVisibility,
}: ChannelsPanelBrightfieldItemProps) {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const isActive = selectedChannelId === BRIGHTFIELD_GROUP_ID;

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

  // Brightfield needs 3 channel slots
  const disabled =
    !isVisible && visibleChannelCount + BRIGHTFIELD_CHANNEL_COUNT > MAX_VISIBLE_CHANNELS;

  let tooltip = `${isVisible ? "Hide" : "Show"} Brightfield`;
  if (disabled)
    tooltip = `Only ${MAX_VISIBLE_CHANNELS} channels can be visible at once (Brightfield uses ${BRIGHTFIELD_CHANNEL_COUNT})`;

  return (
    <Radio value={BRIGHTFIELD_GROUP_ID} className={cx}>
      <PanelRow
        selected={isActive}
        accessory={isLoading && <LavaLoader absolute rows={1} cols={6} />}
        swatch={
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 overflow-hidden rounded-full border-2 border-border"
          >
            <span className="grow h-full bg-red-500" />
            <span className="grow h-full bg-green-500" />
            <span className="grow h-full bg-blue-500" />
          </span>
        }
        title="Brightfield"
        toggle={
          <Tooltip content={tooltip}>
            <Switch
              isSelected={isVisible}
              onChange={() => toggleVisibility()}
              color="var(--color-muted-foreground)"
              isDisabled={disabled}
            />
          </Tooltip>
        }
      />
    </Radio>
  );
}
