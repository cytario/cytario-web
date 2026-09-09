import { fromArrayBuffer } from "geotiff";

import { stripUnsupportedSubImages } from "../loadOmeTiffWithCredentials";

function omeImage(
  id: string,
  opts: {
    sizeC: number;
    sizeZ?: number;
    sizeT?: number;
    tiffData?: string[];
    interleaved?: boolean;
    channelSpp?: number[];
  },
): string {
  const sizeZ = opts.sizeZ ?? 1;
  const sizeT = opts.sizeT ?? 1;
  const spp = opts.channelSpp ?? Array.from({ length: opts.sizeC }, () => 1);
  const channels = spp
    .map((s, i) => `<Channel ID="Channel:${id}:${i}" SamplesPerPixel="${s}"/>`)
    .join("");
  const tiffData = (opts.tiffData ?? [`<TiffData IFD="0"/>`]).join("");
  const interleaved = opts.interleaved ? ` Interleaved="true"` : "";
  return (
    `<Image ID="Image:${id}" Name="${id}">` +
    `<Pixels ID="Pixels:${id}" DimensionOrder="XYCZT" Type="uint8" SizeX="64" SizeY="64"` +
    ` SizeZ="${sizeZ}" SizeC="${opts.sizeC}" SizeT="${sizeT}"${interleaved}>` +
    `${channels}${tiffData}</Pixels></Image>`
  );
}

function wrap(...images: string[]): string {
  const ns = `xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06"`;
  return `<?xml version="1.0" encoding="UTF-8"?><OME ${ns}>${images.join("")}</OME>`;
}

// Little-endian TIFF builder for minimal single-strip grayscale IFDs — enough
// for geotiff.js to parse the file and index its IFDs; no real pixels needed.
function buildTiff(omexml: string, imageCount: number): ArrayBuffer {
  const bytesPerImage = 64 * 64; // one uint8 grayscale plane per IFD
  const headerSize = 8;
  const ifdEntryCount = 7;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;

  const stripOffsets: number[] = [];
  let cursor = headerSize + ifdSize * imageCount;
  for (let i = 0; i < imageCount; i++) {
    stripOffsets.push(cursor);
    cursor += bytesPerImage;
  }
  const omexmlBytes = new TextEncoder().encode(omexml);
  const totalSize = cursor + omexmlBytes.length;

  const view = new DataView(new ArrayBuffer(totalSize));
  const bytes = new Uint8Array(view.buffer);
  view.setUint16(0, 0x4949, true); // little-endian magic
  view.setUint16(2, 42, true);
  view.setUint32(4, headerSize, true); // first IFD at offset 8
  const imageOffset = (i: number) => headerSize + ifdSize * i;

  for (let i = 0; i < imageCount; i++) {
    const ifd = imageOffset(i);
    view.setUint16(ifd, ifdEntryCount, true);
    let entry = ifd + 2;
    const writeEntry = (tag: number, type: number, value: number, count = 1) => {
      view.setUint16(entry, tag, true);
      view.setUint16(entry + 2, type, true);
      view.setUint32(entry + 4, count, true);
      view.setUint32(entry + 8, value, true);
      entry += 12;
    };
    writeEntry(256, 3, 64); // ImageWidth
    writeEntry(257, 3, 64); // ImageLength
    writeEntry(258, 3, 1); // BitsPerSample
    writeEntry(262, 3, 1); // PhotometricInterpretation: BlackIsZero
    writeEntry(273, 4, stripOffsets[i]); // StripOffsets
    writeEntry(279, 4, bytesPerImage); // StripByteCounts
    writeEntry(270, 2, cursor, omexmlBytes.length); // ImageDescription → omexml at end
    view.setUint32(ifd + 2 + ifdEntryCount * 12, i + 1 < imageCount ? imageOffset(i + 1) : 0, true);
    bytes.fill(0, stripOffsets[i], stripOffsets[i] + bytesPerImage);
  }
  bytes.set(omexmlBytes, cursor);
  return view.buffer;
}

// End-to-end over the real pipeline the loader uses: geotiff's IFD cache is
// what the in-place mutation rides on, and viv's loadOmeTiff is what reads
// the mutated fileDirectory — both directions of the reference sharing.
describe("loadOmeTiffWithCredentials reference-sharing (geotiff → viv pipeline)", () => {
  test("the in-place ImageDescription mutation is visible to the cached fileDirectory viv reads", async () => {
    // Shape of LuCa-7color_Scan1: data image + RGB thumbnail sub-images whose
    // TiffData declares fewer planes than SizeZ*SizeT*SizeC, no SubIFDs.
    const omexml = wrap(
      omeImage("0", { sizeC: 4, tiffData: [`<TiffData IFD="0" PlaneCount="4"/>`] }),
      omeImage("1", { sizeC: 3, tiffData: [`<TiffData IFD="4"/>`] }),
      omeImage("2", { sizeC: 3, tiffData: [`<TiffData IFD="5"/>`] }),
    );

    const tiff = await fromArrayBuffer(buildTiff(omexml, 6));
    const firstImage = await tiff.getImage(0);

    expect(firstImage.fileDirectory.ImageDescription).toBe(omexml);

    // The exact mutation the loader performs — must be visible through the
    // SAME image object viv later reads (reference sharing, not a copy).
    const stripped = stripUnsupportedSubImages(omexml);
    firstImage.fileDirectory.ImageDescription = stripped;

    const reread = await tiff.getImage(0);
    // geotiff re-wraps the IFD in a fresh GeoTIFFImage, but both wraps share
    // the SAME fileDirectory object — that shared reference is what carries
    // the mutation into viv's subsequent getImage(0) call.
    expect(reread.fileDirectory).toBe(firstImage.fileDirectory);
    expect(reread.fileDirectory.ImageDescription).toBe(stripped);
    expect(reread.fileDirectory.ImageDescription).not.toContain('ID="Image:1"');
  });

  test("viv's resolveMetadata drops the stripped levels once the mutation ran", async () => {
    const { loadOmeTiff } = await import("@hms-dbmi/viv");
    const omexml = wrap(
      omeImage("0", { sizeC: 2, tiffData: [`<TiffData IFD="0" PlaneCount="2"/>`] }),
      omeImage("1", { sizeC: 3, tiffData: [`<TiffData IFD="2"/>`] }),
    );
    const tiff = await fromArrayBuffer(buildTiff(omexml, 3));
    const firstImage = await tiff.getImage(0);
    firstImage.fileDirectory.ImageDescription = stripUnsupportedSubImages(omexml);

    // loadOmeTiff returns loaders[0] ({ data, metadata }) unless images:"all",
    // but the overload signatures disagree — cast through unknown.
    const result = (await loadOmeTiff("", { source: tiff } as never)) as unknown as {
      data: unknown[];
    };
    // Without the mutation the level count is the Image count (2); with it,
    // only the surviving image remains as a level.
    expect(result.data).toHaveLength(1);
  });
});
