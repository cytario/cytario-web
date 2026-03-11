import { TabPanel } from "@cytario/design";

import { ChannelsControllerItemList } from "./ChannelsControllerItemList";
import { Histogram } from "./Histogram";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { FeatureItem } from "../FeatureBar/FeatureItem";
import { useFeatureBarStore } from "../FeatureBar/useFeatureBar";

export function ChannelsController() {
  const layersStates = useViewerStore(select.layersStates);
  const isExpanded = useFeatureBarStore((state) => state.isExpanded);
  const setIsExpanded = useFeatureBarStore((state) => state.setIsExpanded);
  const channelsOpacity = useViewerStore(select.channelsOpacity);
  const setChannelsOpacity = useViewerStore(select.setChannelsOpacity);
  const visibleChannelCount = useViewerStore(select.visibleChannelCount);
  const channelIds = useViewerStore(select.channelIds);
  const brightfieldGroup = useViewerStore(select.brightfieldGroup);
  const channelsState = useViewerStore(select.channelsState);

  // Show grouped counts: brightfield R/G/B counts as 1 item in the UI
  const groupOffset = brightfieldGroup ? 2 : 0; // 3 channels → 1 item = -2
  const isBrightfieldVisible = brightfieldGroup && channelsState
    ? channelsState[brightfieldGroup.red]?.isVisible &&
      channelsState[brightfieldGroup.green]?.isVisible &&
      channelsState[brightfieldGroup.blue]?.isVisible
    : false;
  const visibleGrouped = visibleChannelCount - (isBrightfieldVisible ? 2 : 0);
  const totalGrouped = channelIds.length - groupOffset;
  const badge = `${visibleGrouped}/${totalGrouped}`;

  return (
    <FeatureItem
      title="Channels"
      badge={badge}
      header={<Histogram />}
      sliderValue={channelsOpacity}
      onSliderChange={setChannelsOpacity}
    >
      {layersStates.map((_, index) => (
        <TabPanel key={index} id={String(index)}>
          <ChannelsControllerItemList
            isExpanded={isExpanded}
            setIsExpanded={setIsExpanded}
          />
        </TabPanel>
      ))}
    </FeatureItem>
  );
}
