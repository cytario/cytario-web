import type { FormatHandler, LoadOptions } from "../format";
import type { Image } from "../image";
import type { ImageMetadata } from "../imageMetadata";

const baseImage = (): Image => ({
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

test("readCharacteristics is optional on FormatHandler (absence is valid)", async () => {
  const handler: FormatHandler = {
    load: async () => ({ data: [], metadata: baseImage() }),
  };
  expect(handler.readCharacteristics).toBeUndefined();
});

test("readCharacteristics returns the same Image type load() yields", async () => {
  const image = baseImage();
  const handler: FormatHandler = {
    load: async () => ({ data: [], metadata: image }),
    readCharacteristics: async () => image,
  };
  const opts: LoadOptions = { signedFetch: async () => new Response() };
  const result = await handler.readCharacteristics?.("https://x/a.ome.tif", opts);
  expect(result).toBe(image);
});

test("ImageMetadata.read resolves Image or null; size resolves number or null", async () => {
  const image = baseImage();
  const capability: ImageMetadata = {
    read: async (connectionId, path) => {
      expect(connectionId).toBe("conn-1");
      expect(path).toBe("slides/a.ome.tif");
      return image;
    },
    size: async () => 1024,
  };
  await expect(capability.read("conn-1", "slides/a.ome.tif")).resolves.toBe(image);
  await expect(capability.size("conn-1", "slides/a.ome.tif")).resolves.toBe(1024);

  const failing: ImageMetadata = {
    read: async () => null,
    size: async () => null,
  };
  await expect(failing.read("conn-1", "x")).resolves.toBeNull();
  await expect(failing.size("conn-1", "x")).resolves.toBeNull();
});
