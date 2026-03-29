import type {
  Image as CziImage,
  Loader as CziLoader,
  LoaderLevel as CziLoaderLevel,
} from "@slash-m/czi-loader";
import type { PixelData, SupportedDtype } from "@vivjs/types";

import type { Image, Loader } from "./ome.tif.types";

const CZI_TILE_SIZE = 512;

/**
 * Adapts a single CZI loader level to viv's PixelSource interface,
 * so it can be used with MultiscaleImageLayer.
 */
class CziPixelSourceAdapter {
  readonly dtype: SupportedDtype;
  readonly tileSize: number;
  readonly shape: number[];
  readonly labels: ["t", "c", "z", "y", "x"];
  private readonly cziLevel: CziLoaderLevel;

  constructor(
    cziLevel: CziLoaderLevel,
    metadata: CziImage,
    levelIndex: number,
  ) {
    this.cziLevel = cziLevel;
    this.dtype = metadata.Pixels.Type as SupportedDtype;
    this.tileSize = CZI_TILE_SIZE;
    this.labels = ["t", "c", "z", "y", "x"];

    // Compute shape for this level by downscaling from full resolution
    const downscale = Math.pow(2, levelIndex);
    const height = Math.ceil(metadata.Pixels.SizeY / downscale);
    const width = Math.ceil(metadata.Pixels.SizeX / downscale);

    this.shape = [
      metadata.Pixels.SizeT ?? 1,
      metadata.Pixels.SizeC ?? metadata.Pixels.Channels.length,
      metadata.Pixels.SizeZ ?? 1,
      height,
      width,
    ];
  }

  async getTile(sel: {
    x: number;
    y: number;
    selection: { t: number; c: number; z: number };
    signal?: AbortSignal;
  }): Promise<PixelData> {
    const result = await this.cziLevel.getTile({
      x: sel.x,
      y: sel.y,
      selection: {
        c: sel.selection.c,
        z: sel.selection.z,
        t: sel.selection.t,
        x: sel.x,
        y: sel.y,
      },
    });
    return result as PixelData;
  }

  async getRaster(sel: {
    selection: { t: number; c: number; z: number };
    signal?: AbortSignal;
  }): Promise<PixelData> {
    const result = await this.cziLevel.getRaster({
      selection: {
        c: sel.selection.c,
        z: sel.selection.z,
        t: sel.selection.t,
        x: 0,
        y: 0,
      },
    });
    return result as PixelData;
  }

  onTileError(err: Error): void {
    console.error("[CZI tile error]", err);
  }
}

/**
 * Adapt CZI loader result to the viv-compatible format used by the viewer store.
 *
 * Wraps each CziLoaderLevel in a CziPixelSourceAdapter and converts
 * CZI Image metadata to the OME-TIFF Image shape expected by the viewer.
 */
export function adaptCziToViv(cziResult: {
  data: CziLoader;
  metadata: CziImage;
}): { data: Loader; metadata: Image } {
  const { data: cziLevels, metadata: cziMeta } = cziResult;

  const adaptedLevels = cziLevels.map(
    (level, i) => new CziPixelSourceAdapter(level, cziMeta, i),
  ) as unknown as Loader;

  const adaptedMetadata = {
    Pixels: {
      ...cziMeta.Pixels,
      ID: "Pixels:0",
      DimensionOrder: "XYZCT" as const,
      SizeT: cziMeta.Pixels.SizeT ?? 1,
      SizeC: cziMeta.Pixels.SizeC ?? cziMeta.Pixels.Channels.length,
      SizeZ: cziMeta.Pixels.SizeZ ?? 1,
      SizeY: cziMeta.Pixels.SizeY,
      SizeX: cziMeta.Pixels.SizeX,
      Channels: cziMeta.Pixels.Channels.map((ch) => ({
        ID: ch.ID,
        Name: ch.Name,
        SamplesPerPixel: ch.SamplesPerPixel,
        Color: ch.Color,
        EmissionWavelength: ch.EmissionWavelength,
        ExcitationWavelength: ch.ExcitationWavelength,
        Fluor: ch.Fluor,
      })),
    },
  } as unknown as Image;

  return { data: adaptedLevels, metadata: adaptedMetadata };
}
