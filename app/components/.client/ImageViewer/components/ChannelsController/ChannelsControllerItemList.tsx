import { useEffect, useMemo } from "react";
import { RadioGroup } from "react-aria-components";

import { ChannelsControllerBrightfieldItem } from "./ChannelsControllerBrightfieldItem";
import { ChannelsControllerItem } from "./ChannelsControllerItem";
import { select } from "../../state/store/selectors";
import { BRIGHTFIELD_GROUP_ID, ChannelsStateColumns } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { useFeatureBarStore } from "../FeatureBar/useFeatureBar";

const MAX_VISIBLE_CHANNELS = 6;

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
  const brightfieldGroup = useViewerStore(select.brightfieldGroup);

  const pixelValues = useFeatureBarStore((state) => state.pixelValues);

  const brightfieldChannelIds = useMemo(() => {
    if (!brightfieldGroup) return new Set<string>();
    return new Set([
      brightfieldGroup.red,
      brightfieldGroup.green,
      brightfieldGroup.blue,
    ]);
  }, [brightfieldGroup]);

  const isBrightfieldVisible = useMemo(() => {
    if (!brightfieldGroup || !channelsState) return false;
    return (
      channelsState[brightfieldGroup.red]?.isVisible &&
      channelsState[brightfieldGroup.green]?.isVisible &&
      channelsState[brightfieldGroup.blue]?.isVisible
    );
  }, [brightfieldGroup, channelsState]);

  const visibleChannelIds = useMemo(
    () =>
      channelIds.filter(
        (id) =>
          !brightfieldChannelIds.has(id) &&
          (isExpanded || channelsState?.[id]?.isVisible),
      ),
    [channelIds, channelsState, isExpanded, brightfieldChannelIds],
  );

  // Show brightfield item when expanded or when it's visible
  const showBrightfield =
    brightfieldGroup && (isExpanded || isBrightfieldVisible);

  useEffect(() => {
    if (visibleChannelIds.length === 0 && !showBrightfield) {
      setIsExpanded(true);
    }
  }, [setIsExpanded, visibleChannelIds.length, showBrightfield]);

  return (
    <RadioGroup
      aria-label="Image channels"
      value={selectedChannelId}
      onChange={(name) => {
        if (!name) return;

        // Check if enabling this channel/group would exceed the viv limit
        const isBrightfield = name === BRIGHTFIELD_GROUP_ID;
        const slotsNeeded = isBrightfield ? 3 : 1;
        const alreadyVisible = isBrightfield ? isBrightfieldVisible : channelsState?.[name]?.isVisible;
        if (!alreadyVisible && visibleChannelCount + slotsNeeded > MAX_VISIBLE_CHANNELS) return;

        setSelectedChannelId(name);
        setChannelVisibility(name as keyof ChannelsStateColumns, true);
      }}
      className="flex flex-col px-3"
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

      {showBrightfield && (
        <ChannelsControllerBrightfieldItem
          isVisible={isBrightfieldVisible}
          isLoading={
            !!channelsState?.[brightfieldGroup.red]?.isLoading ||
            !!channelsState?.[brightfieldGroup.green]?.isLoading ||
            !!channelsState?.[brightfieldGroup.blue]?.isLoading
          }
          visibleChannelCount={visibleChannelCount}
          toggleVisibility={() => {
            const newVisible = !isBrightfieldVisible;
            setChannelVisibility(
              BRIGHTFIELD_GROUP_ID as keyof ChannelsStateColumns,
              newVisible,
            );

            if (!newVisible && selectedChannelId === BRIGHTFIELD_GROUP_ID) {
              setSelectedChannelId(null);
            } else if (newVisible) {
              setSelectedChannelId(BRIGHTFIELD_GROUP_ID);
            }
          }}
        />
      )}
    </RadioGroup>
  );
}
