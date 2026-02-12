import { Channel, Image, Loader } from "./ome.tif.types";
import { ChannelConfig, ChannelsState, RGB } from "./types";
import { OVERLAY_COLORS } from "../components/OverlaysController/getOverlayState";
import { getSelectionStats } from "../utils/getSelectionStats";

/** Returns the RGB color for a channel, falling back to OVERLAY_COLORS if metadata lacks a Color. */
const getInitialColor = (channels: Channel[], index: number): RGB => {
  const colorRaw =
    channels[index]?.Color ?? OVERLAY_COLORS[index % OVERLAY_COLORS.length];
  return colorRaw.slice(0, 3) as RGB;
};

/** Builds the initial channel configs (color, domain, contrast limits) from OME-TIFF metadata. */
export const getInitialChannelsState = async (
  metadata: Image,
  loader: Loader,
) => {
  const channels = metadata.Pixels.Channels as Channel[];

  const selection = { c: 0, x: 0, y: 0, z: 0, t: 0 };
  const { domain, contrastLimits, histogram } = await getSelectionStats({
    loader,
    selection,
  });

  const channelIds = channels.map((ch, i) => ch.Name ?? `Channel ${i}`);

  const initialChannelsState = channels.reduce((acc, channel, index) => {
    const key = channelIds[index];
    const color = getInitialColor(channels, index);

    const isFirstChannel = index === 0;
    const initialChannelConfig: ChannelConfig = {
      selection: { c: index, x: 0, y: 0, z: 0, t: 0 },
      domain: isFirstChannel ? domain : [0, 2 ** 16],
      contrastLimits: isFirstChannel ? contrastLimits : [0, 2 ** 16],
      contrastLimitsInitial: isFirstChannel ? contrastLimits : [0, 2 ** 16],
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
