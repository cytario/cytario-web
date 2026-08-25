import { ChannelsStateColumns, ChannelsState, Selection } from "../state/store/types";

export const mapChannelConfigsToState = (state: ChannelsState): ChannelsStateColumns => {
  return Object.entries(state).reduce<ChannelsStateColumns>(
    (acc, [id, config]) => {
      if (!config.isVisible) return acc;

      acc.ids.push(id);
      acc.channelsVisible.push(config.isVisible);
      acc.contrastLimits.push(config.contrastLimits);
      acc.colors.push(config.color);
      acc.selections.push(
        "selection" in config
          ? (config.selection as Selection)
          : ({ c: 0, x: 0, y: 0, z: 0, t: 0 } as Selection),
      );

      return acc;
    },
    {
      ids: [],
      channelsVisible: [],
      contrastLimits: [],
      colors: [],
      selections: [],
    },
  );
};
