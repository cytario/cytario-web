import { ChannelItemList } from "./ChannelItemList";
import { Histogram } from "./Histogram";
import { select } from "../../../state/store/selectors";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { Section } from "~/components/Section/Section";
import { SectionSlider } from "~/components/Section/SectionSlider";

/** Sidebar channels control: per-channel visibility, color, contrast, histogram. */
export function ChannelsSection() {
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
    <Section
      pillar="channels"
      badge={badge}
      header={<Histogram />}
      actions={
        <SectionSlider
          aria-label="Channels opacity"
          value={channelsOpacity}
          onChange={setChannelsOpacity}
        />
      }
    >
      <ChannelItemList />
    </Section>
  );
}
