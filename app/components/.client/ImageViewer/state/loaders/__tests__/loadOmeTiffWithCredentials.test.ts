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
    `<Pixels DimensionOrder="XYCZT" Type="uint8" SizeX="64" SizeY="64"` +
    ` SizeZ="${sizeZ}" SizeC="${opts.sizeC}" SizeT="${sizeT}"${interleaved}>` +
    `${channels}${tiffData}</Pixels></Image>`
  );
}

function wrap(...images: string[]): string {
  const ns = `xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06"`;
  return `<OME ${ns}>${images.join("")}</OME>`;
}

describe("stripUnsupportedSubImages", () => {
  test("strips RGB sub-images whose TiffData declares fewer planes than SizeZ*SizeT*SizeC", () => {
    const data = omeImage("0", {
      sizeC: 4,
      tiffData: [
        `<TiffData IFD="0"/>`,
        `<TiffData IFD="1"/>`,
        `<TiffData IFD="2"/>`,
        `<TiffData IFD="3"/>`,
      ],
    });
    const thumbnail = omeImage("1", { sizeC: 3, tiffData: [`<TiffData IFD="4"/>`] });
    const overview = omeImage("2", { sizeC: 3, tiffData: [`<TiffData IFD="5"/>`] });
    const result = stripUnsupportedSubImages(wrap(data, thumbnail, overview));

    expect(result).toContain('ID="Image:0"');
    expect(result).not.toContain('ID="Image:1"');
    expect(result).not.toContain('ID="Image:2"');
  });

  test("leaves legacy pyramid files with bare TiffData untouched", () => {
    // Bare <TiffData/> means "the whole file" per the OME schema — one per
    // resolution Image is the common legacy-pyramid convention and must not
    // be treated as a SizeC mismatch.
    const omexml = wrap(
      omeImage("0", { sizeC: 3, tiffData: [`<TiffData/>`] }),
      omeImage("1", { sizeC: 3, tiffData: [`<TiffData/>`] }),
      omeImage("2", { sizeC: 3, tiffData: [`<TiffData/>`] }),
    );
    expect(stripUnsupportedSubImages(omexml)).toBe(omexml);
  });

  test("leaves images untouched when TiffData PlaneCount covers all planes", () => {
    const omexml = wrap(
      omeImage("0", { sizeC: 4, tiffData: [`<TiffData IFD="0" PlaneCount="4"/>`] }),
      omeImage("1", { sizeC: 3, sizeZ: 3, tiffData: [`<TiffData IFD="4" PlaneCount="9"/>`] }),
    );
    expect(stripUnsupportedSubImages(omexml)).toBe(omexml);
  });

  test("strips sub-images declared via Channel SamplesPerPixel > 1", () => {
    const data = omeImage("0", { sizeC: 4, tiffData: [`<TiffData IFD="0" PlaneCount="4"/>`] });
    // One logical channel carrying three components — one IFD total.
    const label = omeImage("1", {
      sizeC: 3,
      channelSpp: [3],
      tiffData: [`<TiffData/>`],
    });
    const result = stripUnsupportedSubImages(wrap(data, label));

    expect(result).toContain('ID="Image:0"');
    expect(result).not.toContain('ID="Image:1"');
  });

  test("strips sub-images declared via Pixels Interleaved=true", () => {
    const data = omeImage("0", { sizeC: 4, tiffData: [`<TiffData IFD="0" PlaneCount="4"/>`] });
    const overview = omeImage("1", {
      sizeC: 3,
      interleaved: true,
      tiffData: [`<TiffData/>`],
    });
    const result = stripUnsupportedSubImages(wrap(data, overview));

    expect(result).toContain('ID="Image:0"');
    expect(result).not.toContain('ID="Image:1"');
  });

  test("strips from the first incompatible image to the end", () => {
    // A well-formed image after a mis-declared one cannot be indexed
    // correctly either — viv's IFD accounting is already polluted — so it is
    // stripped along with the rest to keep the kept images contiguous.
    const data = omeImage("0", { sizeC: 4, tiffData: [`<TiffData IFD="0" PlaneCount="4"/>`] });
    const thumbnail = omeImage("1", { sizeC: 3, tiffData: [`<TiffData IFD="4"/>`] });
    const second = omeImage("2", { sizeC: 2, tiffData: [`<TiffData IFD="5" PlaneCount="2"/>`] });
    const result = stripUnsupportedSubImages(wrap(data, thumbnail, second));

    expect(result).toContain('ID="Image:0"');
    expect(result).not.toContain('ID="Image:1"');
    expect(result).not.toContain('ID="Image:2"');
  });

  test("returns single-image OME-XML unchanged, even when mis-declared", () => {
    const omexml = wrap(omeImage("0", { sizeC: 3, tiffData: [`<TiffData IFD="0"/>`] }));
    expect(stripUnsupportedSubImages(omexml)).toBe(omexml);
  });
});
