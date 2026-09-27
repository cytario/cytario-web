import { imageMetadata } from "../imageMetadata";
import type { Image } from "@cytario/plugin-api";
import { __resetBuiltinFormats } from "~/components/.client/ImageViewer/state/formats/builtins";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { createSignedFetch } from "~/utils/signedFetch";

vi.mock("~/utils/signedFetch", () => ({
  createSignedFetch: vi.fn(() => async () => new Response(null, { status: 200 })),
}));

// The loader modules pull geotiff/viv, so they are mocked with marker metadata.
// What is NOT mocked is the builtins module itself: that is the point of this
// suite — proving the capability registers the built-ins on its own, with no
// viewer ever mounted. Mock paths must match builtins.ts's own `~/`-prefixed
// imports exactly, or vitest treats them as distinct modules and the mock never
// applies. The readers are the loaders' own metadata path, so the marker rides
// on their metadata.
vi.mock("~/components/.client/ImageViewer/state/loaders/loadOmeTiffWithCredentials", () => ({
  loadOmeTiffWithCredentials: vi.fn(async () => ({
    data: [],
    metadata: {
      ID: "tiff-image",
      Pixels: {
        Type: "Uint16",
        Channels: [],
        SizeX: 512,
        SizeY: 512,
        PhysicalSizeXUnit: "µm",
        PhysicalSizeYUnit: "µm",
        PhysicalSizeZUnit: "µm",
      },
    },
  })),
}));
vi.mock("~/components/.client/ImageViewer/state/loaders/loadBioformatsZarrWithCredentials", () => ({
  loadBioformatsZarrWithCredentials: vi.fn(async () => ({
    data: [],
    metadata: {
      ID: "zarr-image",
      Pixels: {
        Type: "Uint16",
        Channels: [],
        SizeX: 256,
        SizeY: 256,
        PhysicalSizeXUnit: "µm",
        PhysicalSizeYUnit: "µm",
        PhysicalSizeZUnit: "µm",
      },
    },
  })),
}));

const markerImage = (id: string): Image => ({
  ID: id,
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

// Simulates a fresh page load where no viewer chunk ever mounted: the format
// registry is empty AND the builtins' idempotence flag is down. The capability
// must register them itself on the next read.
const resetToFreshPageLoad = () => {
  formatRegistry.__reset();
  __resetBuiltinFormats();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSignedFetch).mockReturnValue(signedFetch as never);
  seedConnection();
  resetToFreshPageLoad();
});

describe("imageMetadata self-registers the built-in formats", () => {
  test("read() resolves the OME-TIFF handler with no viewer ever mounted", async () => {
    expect(formatRegistry.list()).toHaveLength(0);

    const image = await imageMetadata.read("conn-1", "slide.ome.tif");

    expect(formatRegistry.list()).toHaveLength(2);
    expect(image?.ID).toBe("tiff-image");
    expect(image?.Pixels.SizeX).toBe(512);
  });

  test("read() resolves the OME-Zarr handler with no viewer ever mounted", async () => {
    expect(formatRegistry.list()).toHaveLength(0);

    const image = await imageMetadata.read("conn-1", "slide.ome.zarr");

    expect(formatRegistry.list()).toHaveLength(2);
    expect(image?.ID).toBe("zarr-image");
  });

  test("read() is repeatable after a registry reset (re-registration per call)", async () => {
    await imageMetadata.read("conn-1", "slide.ome.tif");
    resetToFreshPageLoad();

    const image = await imageMetadata.read("conn-1", "slide.ome.tif");

    expect(formatRegistry.list()).toHaveLength(2);
    expect(image?.ID).toBe("tiff-image");
  });

  test("a plugin handler that already owns the extension still wins", async () => {
    formatRegistry.add("some-plugin", ["ome.tif", "ome.tiff"], {
      load: vi.fn(async () => ({ data: [], metadata: markerImage("plugin-image") })),
    });

    const image = await imageMetadata.read("conn-1", "slide.ome.tif");

    // The built-in OME-TIFF add collides and is skipped, so the plugin's
    // handler answers; the OME-Zarr builtin never registers past the throw.
    expect(image?.ID).toBe("plugin-image");
    expect(formatRegistry.list().some((r) => r.pluginName === "some-plugin")).toBe(true);
  });

  test("size() stays handler-free and does not register the built-ins", async () => {
    expect(formatRegistry.list()).toHaveLength(0);
    signedFetch.mockResolvedValue(
      new Response(null, { status: 200, headers: { "content-length": "4096" } }) as never,
    );

    await expect(imageMetadata.size("conn-1", "slide.ome.tif")).resolves.toBe(4096);

    expect(formatRegistry.list()).toHaveLength(0);
  });
});
