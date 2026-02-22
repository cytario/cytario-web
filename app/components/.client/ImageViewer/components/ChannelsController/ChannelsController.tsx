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

  return (
    <FeatureItem
      title="Channels"
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
