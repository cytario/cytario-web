import { TabPanel, TabPanels } from "@headlessui/react";

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

  return (
    <FeatureItem
      title="Channels"
      header={<Histogram />}
      sliderValue={channelsOpacity}
      onSliderChange={setChannelsOpacity}
    >
      <TabPanels>
        {layersStates.map((_, index) => (
          <TabPanel key={index}>
            <ChannelsControllerItemList
              isExpanded={isExpanded}
              setIsExpanded={setIsExpanded}
            />
          </TabPanel>
        ))}
      </TabPanels>
    </FeatureItem>
  );
}
