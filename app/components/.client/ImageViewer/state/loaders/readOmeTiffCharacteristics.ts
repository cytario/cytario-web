import { fromCustomClient } from "geotiff";

import type { Image } from "../store/core/ome.tif.types";
import { SigV4TiffClient } from "../transport/SigV4TiffClient";
import { normalizePixelType, type PixelType, LoadOptions } from "@cytario/plugin-api";

function attrNum(attrs: string, name: string): number | undefined {
  const match = new RegExp(`${name}="(\\d+)"`).exec(attrs);
  return match ? Number(match[1]) : undefined;
}

function attrStr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match ? match[1] : undefined;
}

function attrFloat(attrs: string, name: string): number | undefined {
  const match = new RegExp(`${name}="([\\d.]+)"`).exec(attrs);
  return match ? Number(match[1]) : undefined;
}

interface ParsedChannel {
  ID: string;
  Name?: string;
  SamplesPerPixel?: number;
}

/**
 * OME-XML → `Image` for the FIRST `<Image>` block, mirroring the OME schema
 * fields viv's `fromString` zod schema parses (Dimensions, Type, Sizes,
 * PhysicalSizes + units, Channels with SamplesPerPixel and Color). Reads NO
 * pixel data.
 */
export function omeXmlToImage(omexml: string): Image {
  const imageMatch = /<Image\b([^>]*)>([\s\S]*?)<\/Image>/.exec(omexml);
  if (!imageMatch) throw new Error("OME-XML has no Image element");
  const imageAttrs = imageMatch[1];
  const imageBody = imageMatch[2];

  const pixelsMatch = /<Pixels\b([^>]*)>/.exec(imageBody);
  if (!pixelsMatch) throw new Error("OME-XML Image has no Pixels element");
  const pxAttrs = pixelsMatch[1];

  const sizeX = attrNum(pxAttrs, "SizeX");
  const sizeY = attrNum(pxAttrs, "SizeY");
  if (!sizeX || !sizeY) throw new Error("OME-XML Pixels lacks SizeX/SizeY");

  const rawType = attrStr(pxAttrs, "Type");
  if (!rawType) throw new Error("OME-XML Pixels lacks Type");
  // viv's parsePixelDataType keeps the OME schema casing; PixelType union is
  // canonical casing via normalizePixelType.
  const pixelType: PixelType = normalizePixelType(rawType);

  const channels: ParsedChannel[] = [...imageBody.matchAll(/<Channel\b([^>]*)>/g)].map(
    (match, index) => {
      const attrs = match[1];
      const channel: ParsedChannel = { ID: attrStr(attrs, "ID") ?? `Channel:0:${index}` };
      const name = attrStr(attrs, "Name");
      if (name !== undefined) channel.Name = name;
      const samplesPerPixel = attrNum(attrs, "SamplesPerPixel");
      if (samplesPerPixel !== undefined) channel.SamplesPerPixel = samplesPerPixel;
      return channel;
    },
  );

  const acquisitionDate = /<AcquisitionDate>([\s\S]*?)<\/AcquisitionDate>/.exec(imageBody);

  return {
    ID: attrStr(imageAttrs, "ID"),
    Name: attrStr(imageAttrs, "Name"),
    AcquisitionDate: acquisitionDate ? acquisitionDate[1] : undefined,
    Pixels: {
      ID: attrStr(pxAttrs, "ID"),
      DimensionOrder: attrStr(pxAttrs, "DimensionOrder"),
      Type: pixelType,
      SizeX: sizeX,
      SizeY: sizeY,
      SizeZ: attrNum(pxAttrs, "SizeZ"),
      SizeC: attrNum(pxAttrs, "SizeC"),
      SizeT: attrNum(pxAttrs, "SizeT"),
      PhysicalSizeX: attrFloat(pxAttrs, "PhysicalSizeX"),
      PhysicalSizeY: attrFloat(pxAttrs, "PhysicalSizeY"),
      PhysicalSizeZ: attrFloat(pxAttrs, "PhysicalSizeZ"),
      PhysicalSizeXUnit: attrStr(pxAttrs, "PhysicalSizeXUnit") ?? "µm",
      PhysicalSizeYUnit: attrStr(pxAttrs, "PhysicalSizeYUnit") ?? "µm",
      PhysicalSizeZUnit: attrStr(pxAttrs, "PhysicalSizeZUnit") ?? "µm",
      Interleaved: /Interleaved="(true|1)"/.test(pxAttrs),
      Channels: channels,
    },
  };
}

/**
 * Metadata-only read of an OME-TIFF: parses IFD 0 (the header block) and maps
 * its OME-XML to `Image`. Issues only the few small range reads geotiff needs
 * to locate and parse IFD 0 — no pixel data, no tile sources.
 */
export async function readOmeTiffCharacteristics(s3Url: string, opts: LoadOptions): Promise<Image> {
  const { signedFetch, headers } = opts;
  const client = new SigV4TiffClient(s3Url, signedFetch, headers);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = await fromCustomClient(client as any, {
    cacheSize: Number.POSITIVE_INFINITY,
  });
  const firstImage = await source.getImage(0);
  const omexml = firstImage.fileDirectory.ImageDescription;
  if (typeof omexml !== "string") {
    throw new Error("OME-TIFF has no OME-XML ImageDescription in IFD 0");
  }
  return omeXmlToImage(omexml);
}
