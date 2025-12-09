import { ChannelsStateColumns, ChannelsState } from "../state/types";

export const mapChannelConfigsToState = (
  state: ChannelsState
): ChannelsStateColumns => {
  return Object.entries(state).reduce<ChannelsStateColumns>(
    (acc, [id, config]) => {
      if (!config.isVisible) return acc;

      acc.ids.push(id);
      acc.channelsVisible.push(config.isVisible);
      acc.contrastLimits.push(config.contrastLimits);
      acc.colors.push(config.color);
      acc.domains.push(config.domain);
      acc.selections.push(config.selection);
      acc.histograms.push(config.histogram);

      return acc;
    },
    {
      ids: [],
      channelsVisible: [],
      contrastLimits: [],
      colors: [],
      domains: [],
      selections: [],
      histograms: [],
    }
  );
};
