// @cytario/plugin-api — public surface.

export type { CytarioPlugin, PluginContext, Logger } from "./plugin";
export type {
  FormatRegistry,
  FormatHandler,
  FileTypeMeta,
  LoadOptions,
  SignedFetch,
} from "./format";
export type {
  Image,
  PixelsMetadata,
  PixelType,
  Channel,
  Wavelength,
  WavelengthUnit,
  Loader,
  LoaderLevel,
  RasterData,
  RasterRequest,
  TileRequest,
  TileSelection,
} from "./image";
export { normalizePixelType } from "./image";

export { assertApiCompatible, IncompatiblePluginError } from "./apiVersion";
export { sanitizeHeaders } from "./headers";
export { satisfies } from "./satisfies";
export { hostApiVersion } from "./version";
