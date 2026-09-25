import { imageMetadata } from "../imageMetadata";
import type { FormatHandler, Image, LoadOptions } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { createSignedFetch } from "~/utils/signedFetch";

vi.mock("~/utils/signedFetch", () => ({
  createSignedFetch: vi.fn(() => async () => new Response(null, { status: 200 })),
}));

const baseImage = (): Image => ({
  ID: "Image:0",
  Pixels: {
    Type: "Uint16",
    Channels: [],
    SizeX: 512,
    SizeY: 512,
    PhysicalSizeXUnit: "µm",
    PhysicalSizeYUnit: "µm",
    PhysicalSizeZUnit: "µm",
  },
});

const signedFetch = vi.fn(async () => new Response(null, { status: 200 }));
vi.mocked(createSignedFetch).mockReturnValue(signedFetch as never);

const seedConnection = () => {
  const store = useConnectionsStore.getState();
  store.setConnections(
    [
      {
        id: "conn-1",
        name: "Test connection",
        bucketName: "bucket-1",
        prefix: "data",
        provider: "aws",
        grants: [],
      } as never,
    ],
    {
      "conn-1": {
        AccessKeyId: "AKIATEST",
        SecretAccessKey: "secret",
        SessionToken: "token",
      } as never,
    },
    {},
    {
      "conn-1": {
        region: "eu-central-1",
        endpoint: null,
        allowsSharing: false,
        accessLevel: "read-only",
      },
    },
  );
};

const registerHandler = (handler: FormatHandler) => {
  formatRegistry.__reset();
  formatRegistry.add("test-plugin", ["ome.tif", "ome.tiff"], handler);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSignedFetch).mockReturnValue(signedFetch as never);
  seedConnection();
});

afterEach(() => {
  formatRegistry.__reset();
});

describe("imageMetadata.read", () => {
  test("uses readCharacteristics when the handler provides one", async () => {
    const image = baseImage();
    const readCharacteristics = vi.fn(async () => image);
    const load = vi.fn(async () => ({ data: [], metadata: baseImage() }));
    registerHandler({ load, readCharacteristics });

    const result = await imageMetadata.read("conn-1", "slide.ome.tif");

    expect(result).toBe(image);
    expect(readCharacteristics).toHaveBeenCalledTimes(1);
    // The URL handed to the handler is the resolved httpsUrl.
    const [url, opts] = readCharacteristics.mock.calls[0] as unknown as [string, LoadOptions];
    expect(url).toBe("https://s3.eu-central-1.amazonaws.com/bucket-1/data/slide.ome.tif");
    expect(opts.signedFetch).toBe(signedFetch);
    expect(load).not.toHaveBeenCalled();
  });

  test("falls back to load() when readCharacteristics is absent", async () => {
    const image = baseImage();
    const load = vi.fn(async () => ({ data: [], metadata: image }));
    registerHandler({ load });

    const result = await imageMetadata.read("conn-1", "slide.ome.tif");

    expect(result).toBe(image);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("falls back to load() when readCharacteristics throws", async () => {
    const image = baseImage();
    const readCharacteristics = vi.fn(async () => {
      throw new Error("unsupported layout");
    });
    const load = vi.fn(async () => ({ data: [], metadata: image }));
    registerHandler({ load, readCharacteristics });

    const result = await imageMetadata.read("conn-1", "slide.ome.tif");

    expect(result).toBe(image);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("resolves null when both readCharacteristics and load fail", async () => {
    const readCharacteristics = vi.fn(async () => {
      throw new Error("boom");
    });
    const load = vi.fn(async () => {
      throw new Error("boom");
    });
    registerHandler({ load, readCharacteristics });

    await expect(imageMetadata.read("conn-1", "slide.ome.tif")).resolves.toBeNull();
  });

  test("resolves null when the format is unknown", async () => {
    formatRegistry.__reset();
    await expect(imageMetadata.read("conn-1", "slide.ome.tif")).resolves.toBeNull();
  });

  test("resolves null when the connection cannot be resolved", async () => {
    registerHandler({ load: vi.fn(async () => ({ data: [], metadata: baseImage() })) });
    await expect(imageMetadata.read("missing", "slide.ome.tif")).resolves.toBeNull();
  });
});

describe("imageMetadata.size", () => {
  test("returns the content-length of a signed HEAD", async () => {
    const headResponse = new Response(null, {
      status: 200,
      headers: { "content-length": "4096" },
    });
    signedFetch.mockResolvedValue(headResponse as never);
    registerHandler({ load: vi.fn() });

    await expect(imageMetadata.size("conn-1", "slide.ome.tif")).resolves.toBe(4096);
    expect(signedFetch).toHaveBeenCalledWith(
      "https://s3.eu-central-1.amazonaws.com/bucket-1/data/slide.ome.tif",
      { method: "HEAD" },
    );
  });

  test("returns null when content-length is missing", async () => {
    signedFetch.mockResolvedValue(new Response(null, { status: 200 }) as never);
    await expect(imageMetadata.size("conn-1", "slide.ome.tif")).resolves.toBeNull();
  });

  test("returns null on a non-OK response", async () => {
    signedFetch.mockResolvedValue(new Response(null, { status: 404 }) as never);
    await expect(imageMetadata.size("conn-1", "slide.ome.tif")).resolves.toBeNull();
  });

  test("returns null when the fetch throws", async () => {
    signedFetch.mockRejectedValue(new Error("CORS") as never);
    await expect(imageMetadata.size("conn-1", "slide.ome.tif")).resolves.toBeNull();
  });

  test("returns null when the connection cannot be resolved", async () => {
    await expect(imageMetadata.size("missing", "slide.ome.tif")).resolves.toBeNull();
  });
});
