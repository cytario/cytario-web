import type { SupportedDtype } from "@vivjs/types";

import { Channel, Image, Loader } from "./ome.tif.types";
import { ChannelConfig, ChannelsState, RGB } from "./types";
import { CATEGORICAL_COLORS } from "../../categoricalColors";
import { getDtypeMax } from "../../utils/getDtypeMax";
import { getSelectionStats } from "../../utils/getSelectionStats";

/** Returns the RGB color for a channel, falling back to CATEGORICAL_COLORS if metadata lacks a Color. */
const getInitialColor = (channels: Channel[], index: number): RGB => {
  const colorRaw = channels[index]?.Color ?? CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
  return colorRaw.slice(0, 3) as RGB;
};

/** Builds the initial channel configs (color, domain, contrast limits) from OME-TIFF metadata. */
export const getInitialChannelsState = async (metadata: Image, loader: Loader) => {
  const channels = metadata.Pixels.Channels as Channel[];

  const selection = { c: 0, x: 0, y: 0, z: 0, t: 0 };
  const { domain, contrastLimits, histogram } = await getSelectionStats({
    loader,
    selection,
  });

  const channelIds = channels.map((ch, i) => ch.Name ?? `Channel ${i}`);
  // dtype is structurally `string` in @cytario/plugin-api; one of the
  // canonical PixelType values is guaranteed at runtime.
  const dtypeMax = getDtypeMax(loader[0].dtype as SupportedDtype);
  const defaultRange: [number, number] = [0, dtypeMax];

  const initialChannelsState = channels.reduce((acc, channel, index) => {
    const key = channelIds[index];
    const color = getInitialColor(channels, index);

    const isFirstChannel = index === 0;
    const initialChannelConfig: ChannelConfig = {
      selection: { c: index, x: 0, y: 0, z: 0, t: 0 },
      domain: isFirstChannel ? domain : defaultRange,
      contrastLimits: isFirstChannel ? contrastLimits : defaultRange,
      contrastLimitsInitial: isFirstChannel ? contrastLimits : defaultRange,
      histogram: isFirstChannel ? histogram : new Array(256).fill(0),
      color,
      isInitialized: false,
      isVisible: isFirstChannel,
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
