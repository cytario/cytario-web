import { loadOmeTiff } from "@vivjs/loaders";
import type { PixelData, SupportedDtype } from "@vivjs/types";

import { RGBA } from "./types";

type OmeTiffImage = Awaited<ReturnType<typeof loadOmeTiff>>;

// Metadata type - same for both OME-TIFF and bioformats2raw zarr
export type Image = OmeTiffImage["metadata"];

/**
 * Generic pixel source that works for both TIFF and Zarr loaders.
 * Both TiffPixelSource and ZarrPixelSource implement this interface.
 */
export interface GenericPixelSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRaster(sel: any): Promise<PixelData>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTile(sel: any): Promise<PixelData>;
  onTileError(err: Error): void;
  shape: number[];
  dtype: SupportedDtype;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  labels: any;
  tileSize: number;
}

// Loader type - array of pixel sources (works for both TIFF and Zarr)
export type Loader = GenericPixelSource[];

export interface Channel {
  ID: string;
  Name?: string;
  SamplesPerPixel?: number;
  Color?: RGBA;
  EmissionWavelength?: Wavelength;
  ExcitationWavelength?: Wavelength;
  Fluor?: string;
}

interface Wavelength {
  Unit: WavelengthUnit;
  Value: number;
}

export type WavelengthUnit =
  | "Ym"
  | "Zm"
  | "Em"
  | "Pm"
  | "Tm"
  | "Gm"
  | "Mm"
  | "km"
  | "hm"
  | "dam"
  | "m"
  | "dm"
  | "cm"
  | "mm"
  | "µm"
  | "nm"
  | "pm"
  | "fm"
  | "am"
  | "zm"
  | "ym"
  | "Å"
  | "thou"
  | "li"
  | "in"
  | "ft"
  | "yd"
  | "mi"
  | "ua"
  | "ly"
  | "pc"
  | "pt"
  | "pixel"
  | "reference frame";
