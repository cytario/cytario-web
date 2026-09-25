import { fromArrayBuffer, writeArrayBuffer } from "geotiff";

import { omeXmlToImage, readOmeTiffCharacteristics } from "../readOmeTiffCharacteristics";
import type { LoadOptions } from "@cytario/plugin-api";

const OMEXML =
  `<OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">` +
  `<Image ID="Image:0" Name="test-image">` +
  `<AcquisitionDate>2024-01-02T03:04:05</AcquisitionDate>` +
  `<Pixels ID="Pixels:0" DimensionOrder="XYZCT" Type="uint16"` +
  ` SizeX="4" SizeY="4" SizeZ="1" SizeC="2" SizeT="1"` +
  ` PhysicalSizeX="0.5" PhysicalSizeY="0.5" PhysicalSizeXUnit="µm"` +
  ` Interleaved="false">` +
  `<Channel ID="Channel:0:0" Name="DAPI" SamplesPerPixel="1"/>` +
  `<Channel ID="Channel:0:1" Name="GFP" SamplesPerPixel="1"/>` +
  `</Pixels></Image></OME>`;

/**
 * geotiff's writer has no ASCII entry for tag 270 (ImageDescription), so the
 * string is spliced in as an extra IFD entry after `writeArrayBuffer`.
 */
async function buildOmeTiffBuffer(omexml: string): Promise<ArrayBuffer> {
  const band = Array.from({ length: 4 }, () => [7, 7, 7, 7]);
  const base = await writeArrayBuffer([band], {
    width: 4,
    height: 4,
    Software: "x".repeat(200),
  });
  const omelen = omexml.length + 1;
  const out = new ArrayBuffer(base.byteLength + omelen + 12);
  new Uint8Array(out).set(new Uint8Array(base));
  const view = new DataView(out);
  const littleEndian = new Uint8Array(out, 0, 2)[0] === 0x49;
  const ifdOffset = view.getUint32(4, littleEndian);
  const count = view.getUint16(ifdOffset, littleEndian);
  view.setUint16(ifdOffset, count + 1, littleEndian);
  const entry = ifdOffset + 2 + count * 12;
  const nextIfd = view.getUint32(ifdOffset + 2 + count * 12, littleEndian);
  view.setUint16(entry, 270, littleEndian);
  view.setUint16(entry + 2, 2, littleEndian); // ASCII
  view.setUint32(entry + 4, omelen, littleEndian);
  view.setUint32(entry + 8, base.byteLength, littleEndian);
  view.setUint32(entry + 12, nextIfd, littleEndian);
  const bytes = new TextEncoder().encode(omexml);
  new Uint8Array(out, base.byteLength).set(bytes);
  new Uint8Array(out, base.byteLength + omexml.length)[0] = 0;
  return out;
}

describe("omeXmlToImage", () => {
  test("maps the first Image block onto the plugin-api Image shape", () => {
    const image = omeXmlToImage(OMEXML);
    expect(image.ID).toBe("Image:0");
    expect(image.Name).toBe("test-image");
    expect(image.AcquisitionDate).toBe("2024-01-02T03:04:05");
    expect(image.Pixels.ID).toBe("Pixels:0");
    expect(image.Pixels.DimensionOrder).toBe("XYZCT");
    expect(image.Pixels.Type).toBe("Uint16");
    expect(image.Pixels.SizeX).toBe(4);
    expect(image.Pixels.SizeY).toBe(4);
    expect(image.Pixels.SizeZ).toBe(1);
    expect(image.Pixels.SizeC).toBe(2);
    expect(image.Pixels.SizeT).toBe(1);
    expect(image.Pixels.PhysicalSizeX).toBe(0.5);
    expect(image.Pixels.PhysicalSizeY).toBe(0.5);
    expect(image.Pixels.PhysicalSizeXUnit).toBe("µm");
    expect(image.Pixels.Interleaved).toBe(false);
    expect(image.Pixels.Channels).toEqual([
      { ID: "Channel:0:0", Name: "DAPI", SamplesPerPixel: 1 },
      { ID: "Channel:0:1", Name: "GFP", SamplesPerPixel: 1 },
    ]);
  });

  test("defaults physical-size units to µm when absent", () => {
    const withoutUnits = OMEXML.replace(/ PhysicalSizeXUnit="µm"/, "");
    const image = omeXmlToImage(withoutUnits);
    expect(image.Pixels.PhysicalSizeXUnit).toBe("µm");
    expect(image.Pixels.PhysicalSizeYUnit).toBe("µm");
  });

  test("normalizes lower-case OME pixel types to canonical casing", () => {
    const lower = OMEXML.replace('Type="uint16"', 'Type="float32"');
    expect(omeXmlToImage(lower).Pixels.Type).toBe("Float32");
  });

  test("throws when Pixels lacks size or type", () => {
    expect(() => omeXmlToImage("<OME/>")).toThrow();
    expect(() =>
      omeXmlToImage('<OME><Image ID="Image:0"><Pixels SizeX="4" SizeY="4"/></Image></OME>'),
    ).toThrow();
  });
});

describe("readOmeTiffCharacteristics", () => {
  test("reads the metadata without decoding pixel data, via few range requests", async () => {
    const buffer = await buildOmeTiffBuffer(OMEXML);
    const slices: string[] = [];
    const signedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const range = headers.get("range");
      if (range) slices.push(range);
      const whole = new Uint8Array(buffer);
      if (!range) {
        return new Response(buffer, { status: 200 });
      }
      const [start, end] = range.replace("bytes=", "").split("-").map(Number);
      const slice = whole.slice(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: { "content-length": String(slice.byteLength) },
      });
    });
    const opts: LoadOptions = { signedFetch: signedFetch as never };

    const image = await readOmeTiffCharacteristics("https://bucket/a.ome.tif", opts);

    expect(image.Pixels.SizeX).toBe(4);
    expect(image.Pixels.SizeY).toBe(4);
    expect(image.Pixels.SizeC).toBe(2);
    expect(image.Pixels.Type).toBe("Uint16");
    expect(image.Pixels.Channels).toHaveLength(2);
    // Header-sized range reads only — geotiff's blocked source fetches in
    // 64 KiB blocks (inclusive end byte), so a metadata-only read is a
    // couple of single-block requests, never a whole-object GET and never
    // a pixel-plane fetch.
    expect(slices.length).toBeGreaterThan(0);
    expect(slices.length).toBeLessThanOrEqual(4);
    expect(signedFetch).toHaveBeenCalledTimes(slices.length);
    for (const range of slices) {
      const [start, end] = range.replace("bytes=", "").split("-").map(Number);
      expect(end - start + 1).toBeLessThanOrEqual(65537);
      expect(start).toBeLessThan(buffer.byteLength);
    }
  });

  test("rejects a TIFF whose IFD 0 has no OME-XML description", async () => {
    const band = Array.from({ length: 4 }, () => [7, 7, 7, 7]);
    const buffer = await writeArrayBuffer([band], { width: 4, height: 4 });
    const signedFetch = vi.fn(async () => new Response(buffer, { status: 200 }));
    await expect(
      readOmeTiffCharacteristics("https://bucket/a.ome.tif", { signedFetch: signedFetch as never }),
    ).rejects.toThrow();
  });

  test("parses the same OME-XML a full load's viv parse would index (parity)", async () => {
    const buffer = await buildOmeTiffBuffer(OMEXML);
    const tiff = await fromArrayBuffer(buffer);
    const firstImage = await tiff.getImage(0);
    // The full load path parses the same ImageDescription string; parity means
    // our mapper agrees with the metadata it derives from.
    const image = omeXmlToImage(firstImage.fileDirectory.ImageDescription as string);
    expect(image.Pixels.SizeX).toBe(firstImage.getWidth());
    expect(image.Pixels.SizeY).toBe(firstImage.getHeight());
  });
});
