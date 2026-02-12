import { getSelectionStats } from "../../utils/getSelectionStats";
import { getInitialChannelsState } from "../getInitialChannelsState";
import { Image, Loader } from "../ome.tif.types";

vi.mock("../../utils/getSelectionStats");

describe("getInitialChannelsState", () => {
  const createMockMetadata = (
    channels: { Name?: string; Color?: number[] }[]
  ): Image =>
    ({
      Pixels: {
        Channels: channels,
      },
    }) as unknown as Image;

  const mockLoader: Loader = [] as unknown as Loader;

  beforeEach(() => {
    vi.mocked(getSelectionStats).mockResolvedValue({
      domain: [0, 65535] as const,
      contrastLimits: [100, 50000] as const,
      histogram: new Array(256).fill(10),
    });
  });

  test("returns channelIds array with channel names", async () => {
    const metadata = createMockMetadata([
      { Name: "DAPI", Color: [0, 0, 255, 255] },
      { Name: "GFP", Color: [0, 255, 0, 255] },
      { Name: "RFP", Color: [255, 0, 0, 255] },
    ]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["DAPI", "GFP", "RFP"]);
  });

  test("returns channelIds with fallback names when channel Name is undefined", async () => {
    const metadata = createMockMetadata([
      { Name: "DAPI" },
      { Name: undefined },
      { Name: "RFP" },
    ]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["DAPI", "Channel 1", "RFP"]);
  });

  test("returns all fallback names when no channel has Name", async () => {
    const metadata = createMockMetadata([{}, {}, {}]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["Channel 0", "Channel 1", "Channel 2"]);
  });

  test("firstChannelKey matches first channelId", async () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "GFP" }]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(result.firstChannelKey).toBe("DAPI");
    expect(result.firstChannelKey).toBe(result.channelIds[0]);
  });

  test("channelsState keys match channelIds", async () => {
    const metadata = createMockMetadata([
      { Name: "DAPI" },
      { Name: "GFP" },
      { Name: "RFP" },
    ]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(Object.keys(result.channelsState)).toEqual(result.channelIds);
  });

  test("only first channel is visible initially", async () => {
    const metadata = createMockMetadata([
      { Name: "DAPI" },
      { Name: "GFP" },
      { Name: "RFP" },
    ]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(result.channelsState["DAPI"].isVisible).toBe(true);
    expect(result.channelsState["GFP"].isVisible).toBe(false);
    expect(result.channelsState["RFP"].isVisible).toBe(false);
  });

  test("first channel has initialized domain and contrastLimits", async () => {
    const metadata = createMockMetadata([{ Name: "DAPI" }, { Name: "GFP" }]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    // First channel gets the actual stats
    expect(result.channelsState["DAPI"].domain).toEqual([0, 65535]);
    expect(result.channelsState["DAPI"].contrastLimits).toEqual([100, 50000]);

    // Other channels get default values
    expect(result.channelsState["GFP"].domain).toEqual([0, 65536]);
    expect(result.channelsState["GFP"].contrastLimits).toEqual([0, 65536]);
  });

  test("channels use color from metadata when available", async () => {
    const metadata = createMockMetadata([
      { Name: "DAPI", Color: [0, 0, 255, 255] },
      { Name: "GFP", Color: [0, 255, 0, 255] },
    ]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    // Color should be RGB (without alpha)
    expect(result.channelsState["DAPI"].color).toEqual([0, 0, 255]);
    expect(result.channelsState["GFP"].color).toEqual([0, 255, 0]);
  });

  test("channels fall back to OVERLAY_COLORS as RGB when metadata lacks Color", async () => {
    const metadata = createMockMetadata([
      { Name: "DAPI" },
      { Name: "CD8" },
      { Name: "PanCK" },
    ]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    // Fallback colors should be RGB (3 elements), not RGBA (4 elements)
    expect(result.channelsState["DAPI"].color).toEqual([255, 0, 0]);
    expect(result.channelsState["CD8"].color).toEqual([255, 128, 0]);
    expect(result.channelsState["PanCK"].color).toEqual([255, 255, 0]);
    expect(result.channelsState["DAPI"].color).toHaveLength(3);
  });

  test("handles single channel", async () => {
    const metadata = createMockMetadata([{ Name: "SingleChannel" }]);

    const result = await getInitialChannelsState(metadata, mockLoader);

    expect(result.channelIds).toEqual(["SingleChannel"]);
    expect(result.firstChannelKey).toBe("SingleChannel");
    expect(result.channelsState["SingleChannel"].isVisible).toBe(true);
  });
});
