import { MAX_CHANNELS } from "@hms-dbmi/viv";

import { ChannelsStateColumns, ChannelsState, Selection } from "../state/store/types";

export const mapChannelConfigsToState = (state: ChannelsState): ChannelsStateColumns => {
  // Only visible channels enter the pipeline: viv fetches every selection's
  // tiles whether or not it is shown, so a hidden selection costs full tile
  // bandwidth for nothing. A visible channel always renders — even while its
  // stats are still loading (default contrast until they land) and even if
  // init failed. viv composites at most MAX_CHANNELS selections (its contrast
  // padding throws beyond that), so later visible ones wait.
  const includedEntries = Object.entries(state)
    .filter(([, config]) => config.isVisible)
    .slice(0, MAX_CHANNELS);

  return includedEntries.reduce<ChannelsStateColumns>(
    (acc, [id, config]) => {
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
