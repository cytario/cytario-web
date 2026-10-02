import { MAX_CHANNELS } from "@hms-dbmi/viv";

import { ChannelsStateColumns, ChannelsState, Selection } from "../state/store/types";

export const mapChannelConfigsToState = (state: ChannelsState): ChannelsStateColumns => {
  // A visible channel always renders — even while its stats are still loading
  // (default contrast until they land) and even if init failed (checked on,
  // silently absent from the canvas otherwise). Hidden-but-initialized channels
  // stay in the pipeline so a re-show serves tiles from the shared cache.
  const renderableEntries = Object.entries(state).filter(
    ([, config]) => config.isVisible || config.isInitialized,
  );
  // viv composites at most MAX_CHANNELS selections (its contrast padding throws
  // beyond that). Reserve slots for the visible channels first, then admit
  // hidden ones into whatever budget remains — both in iteration order, so the
  // columns keep the channelsState order that hoverData indexing relies on.
  // If more visible channels are on than the cap allows (the sidebar guard
  // normally prevents this), later visible ones wait too.
  const visibleIds = new Set(
    renderableEntries.filter(([, config]) => config.isVisible).map(([id]) => id),
  );
  const visibleBudget = Math.min(visibleIds.size, MAX_CHANNELS);
  const hiddenBudget = MAX_CHANNELS - visibleBudget;
  let visibleSeen = 0;
  let hiddenSeen = 0;
  const includedEntries = renderableEntries.filter(([, config]) => {
    if (visibleIds.size > 0 && config.isVisible && visibleSeen < visibleBudget) {
      visibleSeen += 1;
      return true;
    }
    if (visibleIds.size > 0 && config.isVisible) return false;
    const withinHiddenBudget = hiddenSeen < hiddenBudget;
    hiddenSeen += 1;
    return withinHiddenBudget;
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
