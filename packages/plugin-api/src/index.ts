// @cytario/plugin-api — public surface.

export type { CytarioPlugin, PluginContext, Logger } from "./plugin";
export type {
  FormatRegistry,
  FormatHandler,
  FormatExtension,
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
export type { Identity } from "./auth";
export type { GateOutcome, GateRequest, SessionGate, GateRegistry } from "./gates";
export type { SlotName, SlotProps, SlotRegistry, HostConfig } from "./slots";

export { assertApiCompatible, IncompatiblePluginError } from "./apiVersion";
export { sanitizeHeaders } from "./headers";
export { satisfies } from "./satisfies";
export { hostApiVersion } from "./version";
