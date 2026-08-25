import type { SupportedDtype } from "@vivjs/types";

import { Channel, Image, Loader } from "./ome.tif.types";
import { ChannelConfig, ChannelsState, RGB } from "./types";
import { CATEGORICAL_COLORS } from "../../categoricalColors";
import { getDtypeMax } from "../../utils/getDtypeMax";

/** Returns the RGB color for a channel, falling back to CATEGORICAL_COLORS if metadata lacks a Color. */
const getInitialColor = (channels: Channel[], index: number): RGB => {
  const colorRaw = channels[index]?.Color ?? CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
  return colorRaw.slice(0, 3) as RGB;
};

/** Builds the initial channel configs (color, default domain, empty histogram) from OME-TIFF metadata.
 *  No stats are fetched — channels start `isInitialized: false` / `isVisible: false`.
 *  The first channel is enabled via `setChannelVisibility(firstChannelKey, true)` which fetches
 *  stats lazily on first show, same as any other channel toggle. */
export const getInitialChannelsState = (metadata: Image, loader: Loader) => {
  const channels = metadata.Pixels.Channels as Channel[];

  const channelIds = channels.map((ch, i) => ch.Name ?? `Channel ${i}`);
  const dtypeMax = getDtypeMax(loader[0].dtype as SupportedDtype);
  const defaultRange: [number, number] = [0, dtypeMax];

  const initialChannelsState = channels.reduce((acc, channel, index) => {
    const key = channelIds[index];
    const color = getInitialColor(channels, index);

    const initialChannelConfig: ChannelConfig = {
      selection: { c: index, x: 0, y: 0, z: 0, t: 0 },
      domain: defaultRange,
      contrastLimits: defaultRange,
      histogram: new Array(256).fill(0),
      color,
      isInitialized: false,
      isVisible: false,
      isLoading: false,
    };

    return {
      ...acc,
      [key]: initialChannelConfig,
    };
  }, {} as ChannelsState);

  return {
    channelsState: initialChannelsState,
    channelIds,
    firstChannelKey: channelIds[0],
  };
};
