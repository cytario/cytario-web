import { TabPanel } from "@cytario/design";

import { ChannelsPanelItemList } from "./ChannelsPanelItemList";
import { Histogram } from "./Histogram";
import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";

export function ChannelsPanel() {
  const layersStates = useViewerStore(select.layersStates);
  const channelsOpacity = useViewerStore(select.channelsOpacity);
  const setChannelsOpacity = useViewerStore(select.setChannelsOpacity);
  const visibleChannelCount = useViewerStore(select.visibleChannelCount);
  const channelIds = useViewerStore(select.channelIds);
  const brightfieldGroup = useViewerStore(select.brightfieldGroup);
  const channelsState = useViewerStore(select.channelsState);

  // Show grouped counts: brightfield R/G/B counts as 1 item in the UI
  const groupOffset = brightfieldGroup ? 2 : 0; // 3 channels → 1 item = -2
  const isBrightfieldVisible =
    brightfieldGroup && channelsState
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
      actions={
        <FeatureItemSlider
          aria-label="Channels opacity"
          value={channelsOpacity}
          onChange={setChannelsOpacity}
        />
      }
    >
      {layersStates.map((_, index) => (
        <TabPanel key={index} id={String(index)}>
          <ChannelsPanelItemList />
        </TabPanel>
      ))}
    </FeatureItem>
  );
}
