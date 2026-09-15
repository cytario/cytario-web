import { Switch, Tooltip } from "@cytario/design";
import { Radio } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { BRIGHTFIELD_CHANNEL_COUNT, MAX_VISIBLE_CHANNELS } from "./constants";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { BRIGHTFIELD_GROUP_ID, RGB } from "../../../state/store/types";
import { SectionRow } from "../SectionRow/SectionRow";

// Literal RGB channel colors — content, not UI state; deliberately not design tokens.
const BRIGHTFIELD_RGB: RGB[] = [
  [239, 68, 68],
  [34, 197, 94],
  [59, 130, 246],
];

interface ChannelBrightfieldItemProps {
  isVisible: boolean;
  isLoading: boolean;
  visibleChannelCount: number;
  toggleVisibility: () => void;
}

export function ChannelBrightfieldItem({
  isVisible,
  isLoading,
  visibleChannelCount,
  toggleVisibility,
}: ChannelBrightfieldItemProps) {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const isSelected = selectedChannelId === BRIGHTFIELD_GROUP_ID;

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
      <SectionRow
        title="Brightfield"
        isSelected={isSelected}
        isLoading={isLoading}
        colors={BRIGHTFIELD_RGB}
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
