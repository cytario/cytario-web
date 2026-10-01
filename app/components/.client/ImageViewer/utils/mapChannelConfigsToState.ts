import { MAX_CHANNELS } from "@hms-dbmi/viv";

import { ChannelsStateColumns, ChannelsState, Selection } from "../state/store/types";

export const mapChannelConfigsToState = (state: ChannelsState): ChannelsStateColumns => {
  const initializedEntries = Object.entries(state).filter(([, config]) => config.isInitialized);
  const visibleCount = initializedEntries.filter(([, config]) => config.isVisible).length;
  // viv composites at most MAX_CHANNELS selections (its contrast padding throws
  // beyond that), so once the visible channels fill the budget the remaining
  // hidden ones are dropped in iteration order.
  const hiddenBudget = MAX_CHANNELS - visibleCount;
  let hiddenSeen = 0;
  const includedEntries = initializedEntries.filter(([, config]) => {
    if (config.isVisible) return true;
    const withinBudget = hiddenSeen < hiddenBudget;
    hiddenSeen += 1;
    return withinBudget;
  });

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
