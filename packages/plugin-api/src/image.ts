// Structural Image / Loader contract — host-independent. TypeScript surface
// is permissive; PixelType casing and wavelength units are normative.

/**
 * Canonical pixel types. Plugin handlers MUST emit one of these exact
 * strings; viv's lower-case variants ("uint16") are NOT valid. The host's
 * built-in OME-Zarr loader normalises the upstream lower-case dtype to
 * canonical casing before yielding metadata.
 */
export type PixelType =
  | "Uint8"
  | "Uint16"
  | "Uint32"
  | "Int8"
  | "Int16"
  | "Int32"
  | "Float32"
  | "Float64";

/**
 * Lower-case → canonical mapping. Exported so plugin authors and the
 * built-in loaders share one normalisation function rather than each
 * coercing dtype strings independently.
 */
const PIXEL_TYPE_CANONICAL: Record<string, PixelType> = {
  uint8: "Uint8",
  uint16: "Uint16",
  uint32: "Uint32",
  int8: "Int8",
  int16: "Int16",
  int32: "Int32",
  float32: "Float32",
  float64: "Float64",
};

export function normalizePixelType(dtype: string): PixelType {
  const lower = dtype.toLowerCase();
  const canonical = PIXEL_TYPE_CANONICAL[lower];
  if (!canonical) {
    throw new Error(
      `Unknown pixel type: ${JSON.stringify(dtype)}. ` +
        `Expected one of: ${Object.values(PIXEL_TYPE_CANONICAL).join(", ")}.`,
    );
  }
  return canonical;
}

export type WavelengthUnit = string;

export interface Wavelength {
  Value: number;
  Unit: WavelengthUnit;
}

export interface Channel {
  ID: string;
  Name?: string;
  SamplesPerPixel?: number;
  Color?: [number, number, number, number];
  EmissionWavelength?: Wavelength;
  ExcitationWavelength?: Wavelength;
  Fluor?: string;
}

export interface PixelsMetadata {
  Type: PixelType;
  Channels: Channel[];
  SizeX: number;
  SizeY: number;
  SizeZ?: number;
  SizeC?: number;
  SizeT?: number;
  PhysicalSizeX?: number;
  PhysicalSizeY?: number;
  PhysicalSizeZ?: number;
  // Required strings (may be empty) so call sites that pass them as
  // `WavelengthUnit` arguments don't need to narrow `string | undefined`.
  PhysicalSizeXUnit: string;
  PhysicalSizeYUnit: string;
  PhysicalSizeZUnit: string;
  DimensionOrder?: string;
  Interleaved?: boolean;
  ID?: string;
  Description?: string;
}

export interface Image {
  ID?: string;
  Name?: string;
  AcquisitionDate?: string;
  Description?: string;
  Pixels: PixelsMetadata;
}

export type TileSelection = {
  c: number;
  t: number;
  z: number;
  x: number;
  y: number;
};

export interface RasterData {
  data:
    | Uint8Array
    | Uint16Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array;
  width: number;
  height: number;
}

/**
 * Tile request the host issues against a `LoaderLevel`. `selection` carries
 * the channel/time/depth axes; concrete plugin authors are free to extend
 * the type via declaration merging if they need vendor-specific fields,
 * but the four properties below are normative.
 */
export interface TileRequest {
  x: number;
  y: number;
  selection: TileSelection;
  signal?: AbortSignal;
}

/** Raster request — same selection shape, no tile coordinates. */
export interface RasterRequest {
  selection: TileSelection;
  signal?: AbortSignal;
}

export interface LoaderLevel {
  getTile(req: TileRequest): Promise<RasterData>;
  getRaster(req: RasterRequest): Promise<RasterData>;
  onTileError?(err: Error): void;
  shape: number[];
  dtype: string;
  labels: string[];
  tileSize: number;
}

export type Loader = LoaderLevel[];
