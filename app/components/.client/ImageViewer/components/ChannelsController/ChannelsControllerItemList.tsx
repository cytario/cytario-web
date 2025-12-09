import { RadioGroup } from "@headlessui/react";
import { useEffect, useMemo } from "react";
import { twMerge } from "tailwind-merge";

import { ChannelsControllerItem } from "./ChannelsControllerItem";
import { select } from "../../state/selectors";
import { ChannelsStateColumns } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { useFeatureBarStore } from "../FeatureBar/useFeatureBar";

export function ChannelsControllerItemList({
  isExpanded,
  setIsExpanded,
}: {
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
}) {
  const channelsState = useViewerStore(select.channelsState);
  const channelIds = useViewerStore(select.channelIds);
  const maxChannelDomain = useViewerStore(select.maxChannelDomain);
  const visibleChannelCount = useViewerStore(select.visibleChannelCount);
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const setSelectedChannelId = useViewerStore(select.setSelectedChannelId);
  const setChannelVisibility = useViewerStore(select.setChannelVisibility);
  const setChannelColor = useViewerStore(select.setChannelColor);

  const pixelValues = useFeatureBarStore((state) => state.pixelValues);

  const visibleChannelIds = useMemo(
    () =>
      channelIds.filter((id) => isExpanded || channelsState?.[id]?.isVisible),
    [channelIds, channelsState, isExpanded]
  );

  const cx = twMerge(
    "grid gap-1 m-1 grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"
  );

  useEffect(() => {
    if (visibleChannelIds.length === 0) {
      setIsExpanded(true);
    }
  }, [setIsExpanded, visibleChannelIds.length]);

  return (
    <RadioGroup
      value={selectedChannelId}
      onChange={(name) => {
        setSelectedChannelId(name);
        if (name) {
          setChannelVisibility(name as keyof ChannelsStateColumns, true);
        }
      }}
      className={cx}
    >
      {visibleChannelIds.map((id) => {
        const config = channelsState?.[id];
        if (!config) return null;

        const name = id as keyof ChannelsStateColumns;
        const { color, isVisible, isLoading } = config;

        const toggleChannelVisibility = () => {
          setChannelVisibility(name, !isVisible);

          if (isVisible && name === selectedChannelId) {
            setSelectedChannelId(null);
          } else if (!isVisible) {
            setSelectedChannelId(name);
          }
        };

        return (
          <ChannelsControllerItem
            key={id}
            name={name}
            color={[...color, 255]}
            isVisible={isVisible}
            isLoading={isLoading}
            pixelValue={pixelValues[name] ?? 0}
            maxDomain={maxChannelDomain}
            visibleChannelCount={visibleChannelCount}
            toggleChannelVisibility={toggleChannelVisibility}
            onColorChange={(newColor) => setChannelColor(id, newColor)}
          />
        );
      })}
    </RadioGroup>
  );
}
