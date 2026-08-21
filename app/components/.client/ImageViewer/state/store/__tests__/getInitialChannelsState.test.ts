import { getInitialChannelsState } from "../getInitialChannelsState";
import { Image, Loader } from "../ome.tif.types";

describe("getInitialChannelsState", () => {
  const createMockMetadata = (channels: { Name?: string; Color?: number[] }[]): Image =>
    ({
      Pixels: {
        Channels: channels,
      },
    }) as unknown as Image;

  const mockLoader: Loader = [{ dtype: "Uint16" }] as unknown as Loader;
  const dtypeMax = 65535;

  test("returns channelIds array with channel names", () => {
    const metadata = createMockMetadata([
      { Name: "DAPI", Color: [0, 0, 255, 255] },
      { Name: "GFP", Color: [0, 255, 0, 255] },
      { Name: "RFP", Color: [255, 0, 0, 255] },
    ]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["DAPI", "GFP", "RFP"]);
  });

  test("returns channelIds with fallback names when channel Name is undefined", () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: undefined }, { Name: "RFP" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["DAPI", "Channel 1", "RFP"]);
  });

  test("returns all fallback names when no channel has Name", () => {
    const metadata = createMockMetadata([{}, {}, {}]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["Channel 0", "Channel 1", "Channel 2"]);
  });

  test("firstChannelKey matches first channelId", () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "GFP" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.firstChannelKey).toBe("DAPI");
    expect(result.firstChannelKey).toBe(result.channelIds[0]);
  });

  test("channelsState keys match channelIds", () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "GFP" }, { Name: "RFP" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(Object.keys(result.channelsState)).toEqual(result.channelIds);
  });

  test("all channels start invisible and uninitialized", () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "GFP" }, { Name: "RFP" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelsState["DAPI"].isVisible).toBe(false);
    expect(result.channelsState["GFP"].isVisible).toBe(false);
    expect(result.channelsState["RFP"].isVisible).toBe(false);
    expect(result.channelsState["DAPI"].isInitialized).toBe(false);
    expect(result.channelsState["GFP"].isInitialized).toBe(false);
    expect(result.channelsState["RFP"].isInitialized).toBe(false);
  });

  test("all channels get dtype-max default domain and contrastLimits", () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "GFP" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelsState["DAPI"].domain).toEqual([0, dtypeMax]);
    expect(result.channelsState["DAPI"].contrastLimits).toEqual([0, dtypeMax]);
    expect(result.channelsState["DAPI"].contrastLimitsInitial).toEqual([0, dtypeMax]);
    expect(result.channelsState["GFP"].domain).toEqual([0, dtypeMax]);
    expect(result.channelsState["GFP"].contrastLimits).toEqual([0, dtypeMax]);
    expect(result.channelsState["GFP"].contrastLimitsInitial).toEqual([0, dtypeMax]);
  });

  test("channels use color from metadata when available", () => {
    const metadata = createMockMetadata([
      { Name: "DAPI", Color: [0, 0, 255, 255] },
      { Name: "GFP", Color: [0, 255, 0, 255] },
    ]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelsState["DAPI"].color).toEqual([0, 0, 255]);
    expect(result.channelsState["GFP"].color).toEqual([0, 255, 0]);
  });

  test("channels fall back to CATEGORICAL_COLORS as RGB when metadata lacks Color", () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "CD8" }, { Name: "PanCK" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelsState["DAPI"].color).toEqual([255, 0, 0]);
    expect(result.channelsState["CD8"].color).toEqual([255, 128, 0]);
    expect(result.channelsState["PanCK"].color).toEqual([255, 255, 0]);
    expect(result.channelsState["DAPI"].color).toHaveLength(3);
  });

  test("handles single channel", () => {
    const metadata = createMockMetadata([{ Name: "SingleChannel" }]);

    const result = getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["SingleChannel"]);
    expect(result.firstChannelKey).toBe("SingleChannel");
    expect(result.channelsState["SingleChannel"].isVisible).toBe(false);
  });
});
