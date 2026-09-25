import { rootAttrsToImage } from "../loadBioformatsZarrWithCredentials";
import { readOmeZarrCharacteristics } from "../readOmeZarrCharacteristics";
import type { LoadOptions } from "@cytario/plugin-api";

const SERIES_ATTRS = {
  multiscales: [
    {
      axes: [
        { name: "t", type: "time" },
        { name: "c", type: "channel" },
        { name: "z", type: "space", unit: "µm" },
        { name: "y", type: "space", unit: "µm" },
        { name: "x", type: "space", unit: "µm" },
      ],
      datasets: [
        {
          path: "0",
          coordinateTransformations: [{ type: "scale", scale: [1, 1, 1, 0.65, 0.65] }],
        },
      ],
    },
  ],
};

const ROOT_ATTRS = {
  omero: {
    name: "test-image",
    channels: [
      { label: "DAPI", color: "FF0000", window: { start: 0, end: 255 } },
      { label: "GFP", color: "00FF00", window: { start: 0, end: 255 } },
    ],
    rdefs: { model: "color" },
  },
  multiscales: SERIES_ATTRS.multiscales,
};

const ZARRAY = { shape: [1, 2, 1, 512, 512], chunks: [1, 1, 1, 256, 256], dtype: "<u2" };

describe("readOmeZarrCharacteristics", () => {
  const buildSignedFetch = (fetchedUrls: string[], notFound: string[] = []) =>
    vi.fn(async (url: string) => {
      fetchedUrls.push(url);
      if (notFound.includes(url)) return new Response(null, { status: 404 });
      if (url.endsWith("/0/.zarray")) return Response.json(ZARRAY);
      if (url.endsWith("/0/.zattrs")) return Response.json(SERIES_ATTRS);
      if (url.endsWith("/.zattrs")) return Response.json(ROOT_ATTRS);
      return new Response(null, { status: 404 });
    });

  test("issues exactly three JSON GETs and maps to the Image shape", async () => {
    const fetchedUrls: string[] = [];
    const opts: LoadOptions = { signedFetch: buildSignedFetch(fetchedUrls) as never };

    const image = await readOmeZarrCharacteristics("https://bucket/a.ome.zarr/", opts);

    expect(fetchedUrls).toEqual([
      "https://bucket/a.ome.zarr/0/.zattrs",
      "https://bucket/a.ome.zarr/0/.zarray",
      "https://bucket/a.ome.zarr/.zattrs",
    ]);
    expect(image.ID).toBe("Image:0");
    expect(image.Name).toBe("test-image");
    expect(image.Pixels.SizeX).toBe(512);
    expect(image.Pixels.SizeY).toBe(512);
    expect(image.Pixels.SizeC).toBe(2);
    expect(image.Pixels.SizeZ).toBe(1);
    expect(image.Pixels.SizeT).toBe(1);
    expect(image.Pixels.Type).toBe("Uint16");
    expect(image.Pixels.PhysicalSizeX).toBe(0.65);
    expect(image.Pixels.Channels).toHaveLength(2);
    expect(image.Pixels.Channels[0]).toEqual({
      ID: "Channel:0:0",
      Name: "DAPI",
      Color: [255, 0, 0, 255],
    });
  });

  test("metadata matches the full load's mapper for the same attrs", async () => {
    const fetchedUrls: string[] = [];
    const opts: LoadOptions = { signedFetch: buildSignedFetch(fetchedUrls) as never };
    const read = await readOmeZarrCharacteristics("https://bucket/a.ome.zarr/", opts);

    // The load path maps RootAttrs + a loader whose level-0 carries the same
    // shape/labels/dtype the .zarray carries — the outputs must agree.
    const viaLoad = rootAttrsToImage(ROOT_ATTRS as never, {
      shape: ZARRAY.shape,
      labels: ["t", "c", "z", "y", "x"],
      dtype: "uint16",
    });
    expect(read).toEqual(viaLoad);
  });

  test("rejects when the base resolution .zarray is missing", async () => {
    const fetchedUrls: string[] = [];
    const opts: LoadOptions = {
      signedFetch: buildSignedFetch(fetchedUrls, ["https://bucket/a.ome.zarr/0/.zarray"]) as never,
    };
    await expect(readOmeZarrCharacteristics("https://bucket/a.ome.zarr/", opts)).rejects.toThrow();
  });

  test("rejects when no multiscales metadata is present", async () => {
    const opts: LoadOptions = {
      signedFetch: vi.fn(async (url: string) => {
        if (url.endsWith("/0/.zarray")) return Response.json(ZARRAY);
        return new Response(null, { status: 404 });
      }) as never,
    };
    await expect(readOmeZarrCharacteristics("https://bucket/a.ome.zarr/", opts)).rejects.toThrow();
  });
});
