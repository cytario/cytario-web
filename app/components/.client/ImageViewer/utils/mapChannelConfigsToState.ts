import {
  ChannelsStateColumns,
  ChannelsState,
  LayerChannelsState,
  Selection,
} from "../state/store/types";

export const mapChannelConfigsToState = (
  state: ChannelsState | LayerChannelsState,
): ChannelsStateColumns => {
  return Object.entries(state).reduce<ChannelsStateColumns>(
    (acc, [id, config]) => {
      if (!config.isVisible) return acc;

      acc.ids.push(id);
      acc.channelsVisible.push(config.isVisible);
      acc.contrastLimits.push(config.contrastLimits);
      acc.colors.push(config.color);
      acc.selections.push(
        (config as { selection?: Selection }).selection ?? { c: 0, x: 0, y: 0, z: 0, t: 0 },
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
