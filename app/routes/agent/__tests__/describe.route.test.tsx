import { render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getSelectionStats } from "~/components/.client/ImageViewer/utils/getSelectionStats";
import { imageMetadata } from "~/lib/imageMetadata";
import DescribeRoute, { loader } from "~/routes/agent/describe.route";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

vi.mock("~/lib/imageMetadata", () => ({
  imageMetadata: {
    loadImage: vi.fn(),
    read: vi.fn(),
    size: vi.fn(),
  },
}));

vi.mock("~/components/.client/ImageViewer/utils/getSelectionStats", () => ({
  getSelectionStats: vi.fn(),
}));

const loadImage = vi.mocked(imageMetadata.loadImage);
const stats = vi.mocked(getSelectionStats);

const baseImage = () => ({
  ID: "Image:0",
  Pixels: {
    Type: "Uint16",
    Channels: [
      { ID: "0", Name: "DAPI", Fluor: "Cy5", Color: [0, 0, 255, 255] },
      { ID: "1", Name: "FITC" },
      { ID: "2" },
    ],
    SizeX: 512,
    SizeY: 512,
    SizeZ: 1,
    SizeC: 3,
    SizeT: 1,
    PhysicalSizeXUnit: "µm",
    PhysicalSizeYUnit: "µm",
    PhysicalSizeZUnit: "µm",
  },
});

const fakeLoader = [
  {
    getTile: vi.fn(),
    getRaster: vi.fn(),
    shape: [512, 512],
    dtype: "<u2",
    labels: [],
    tileSize: 512,
  },
];

const seedConnection = () => {
  useConnectionsStore.setState({
    connections: {
      "conn-1": {
        connectionConfig: mock.connectionConfig() as never,
        credentials: mock.credentials(),
        provider: {
          region: "eu-central-1",
          endpoint: null,
          allowsSharing: false,
          accessLevel: "annotate",
        },
        status: "connected",
      },
    },
  });
};

function renderDescribe(search: string) {
  const Stub = createRoutesStub([
    {
      path: "/agent/describe",
      Component: DescribeRoute,
      loader,
    },
  ]);
  return render(<Stub initialEntries={[`/agent/describe${search}`]} />);
}

describe("Agent Describe Route", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    seedConnection();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, assign },
    });
  });

  afterEach(() => {
    useConnectionsStore.setState({ connections: {} });
  });

  test("probe returns ok:true with no data", async () => {
    const response = await loader({
      request: new Request("http://x/agent/describe?probe"),
    } as never);
    const data = await response!.json();
    expect(data).toEqual({ ok: true });
  });

  test("computes stats per channel and navigates with the urlencoded payload", async () => {
    loadImage.mockResolvedValue({ loader: fakeLoader as never, metadata: baseImage() as never });
    stats.mockResolvedValue({
      domain: [0, 65535],
      contrastLimits: [45874, 65528],
      histogram: new Array(256).fill(0),
    } as never);

    renderDescribe("?connectionId=conn-1&path=slide.ome.tif&port=9999");

    await waitFor(() => {
      expect(stats).toHaveBeenCalledTimes(3);
    });
    expect(stats).toHaveBeenNthCalledWith(1, {
      loader: fakeLoader,
      selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
    });

    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    const target = assign.mock.calls[0][0] as string;
    expect(target).toMatch(/^http:\/\/127\.0\.0\.1:9999\/result\?payload=/);
    const payload = JSON.parse(decodeURIComponent(target.split("payload=")[1]));
    expect(payload).toEqual({
      connectionId: "conn-1",
      path: "slide.ome.tif",
      image: {
        dimensions: { x: 512, y: 512, z: 1, c: 3, t: 1 },
        pixelType: "Uint16",
        levelCount: 1,
        channels: [
          {
            key: "DAPI",
            name: "DAPI",
            fluor: "Cy5",
            color: [0, 0, 255, 255],
            contrastLimits: [45874, 65528],
          },
          {
            key: "FITC",
            name: "FITC",
            fluor: undefined,
            color: undefined,
            contrastLimits: [45874, 65528],
          },
          {
            key: "Channel 2",
            name: "Channel 2",
            fluor: undefined,
            color: undefined,
            contrastLimits: [45874, 65528],
          },
        ],
      },
    });
    expect(await screen.findByText(/Result delivered to the CLI/i)).toBeInTheDocument();
  });

  test("navigates with ?error= when the image cannot be loaded", async () => {
    loadImage.mockResolvedValue(null);

    renderDescribe("?connectionId=conn-1&path=missing.ome.tif&port=9999");

    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    const target = assign.mock.calls[0][0] as string;
    expect(target).toMatch(/^http:\/\/127\.0\.0\.1:9999\/result\?error=/);
  });

  test("invalid port shows an inline error and never navigates", async () => {
    renderDescribe("?connectionId=conn-1&path=slide.ome.tif&port=99999");

    expect(await screen.findByText(/Invalid port/i)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
  });

  test("channel key falls back to Channel i when Name is missing", async () => {
    loadImage.mockResolvedValue({ loader: fakeLoader as never, metadata: baseImage() as never });
    stats.mockResolvedValue({
      domain: [0, 65535],
      contrastLimits: [100, 200],
      histogram: new Array(256).fill(0),
    } as never);

    renderDescribe("?connectionId=conn-1&path=slide.ome.tif&port=9999");

    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    const target = assign.mock.calls[0][0] as string;
    const payload = JSON.parse(decodeURIComponent(target.split("payload=")[1]));
    expect(payload.image.channels.map((channel: { key: string }) => channel.key)).toEqual([
      "DAPI",
      "FITC",
      "Channel 2",
    ]);
  });

  test("a failing channel records contrastLimits null and continues", async () => {
    loadImage.mockResolvedValue({ loader: fakeLoader as never, metadata: baseImage() as never });
    stats
      .mockResolvedValueOnce({
        domain: [0, 65535],
        contrastLimits: [45874, 65528],
        histogram: new Array(256).fill(0),
      } as never)
      .mockRejectedValueOnce(new Error("raster failed"))
      .mockResolvedValueOnce({
        domain: [0, 65535],
        contrastLimits: [10, 20],
        histogram: new Array(256).fill(0),
      } as never);

    renderDescribe("?connectionId=conn-1&path=slide.ome.tif&port=9999");

    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    const target = assign.mock.calls[0][0] as string;
    const payload = JSON.parse(decodeURIComponent(target.split("payload=")[1]));
    expect(payload.image.channels[0].contrastLimits).toEqual([45874, 65528]);
    expect(payload.image.channels[1].contrastLimits).toBeNull();
    expect(payload.image.channels[2].contrastLimits).toEqual([10, 20]);
  });

  test("brightfield R/G/B channels use domain as contrastLimits", async () => {
    const rgbImage = baseImage();
    rgbImage.Pixels.Channels = [
      { ID: "0", Name: "Red" },
      { ID: "1", Name: "Green" },
      { ID: "2", Name: "Blue" },
    ];
    loadImage.mockResolvedValue({ loader: fakeLoader as never, metadata: rgbImage as never });
    stats.mockResolvedValue({
      domain: [5, 60000],
      contrastLimits: [45874, 65528],
      histogram: new Array(256).fill(0),
    } as never);

    renderDescribe("?connectionId=conn-1&path=slide.ome.tif&port=9999");

    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    const target = assign.mock.calls[0][0] as string;
    const payload = JSON.parse(decodeURIComponent(target.split("payload=")[1]));
    expect(
      payload.image.channels.map((channel: { contrastLimits: unknown }) => channel.contrastLimits),
    ).toEqual([
      [5, 60000],
      [5, 60000],
      [5, 60000],
    ]);
  });
});
