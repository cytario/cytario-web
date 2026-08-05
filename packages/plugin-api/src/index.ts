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
export type {
  ContextMenuTarget,
  ContextMenuNode,
  ContextMenuActivationContext,
  ContextMenuEntry,
  ContextMenuRegistry,
} from "./contextMenus";
export type {
  SidebarNavTarget,
  SidebarNavActivationContext,
  NavNavigate,
  SidebarNavEntry,
  SidebarNavRegistry,
} from "./sidebarNav";
export type {
  RouteLoaderArgs,
  RouteLoader,
  RouteActionArgs,
  RouteAction,
  RouteContribution,
  RouteRegistry,
} from "./routes";
export type {
  ServerEndpointAuth,
  ServerEndpointContribution,
  ServerEndpointRegistry,
} from "./serverEndpoints";
export type {
  ConnectionProjection,
  ComputeConnectionProjection,
  CatalogConnectionProjection,
  ConnectionFetch,
  ObjectStore,
  StorageEntry,
  ComputeRoleSession,
  TokenGrant,
  JobRecord,
  JobLedger,
  HostCapabilities,
} from "./host";

export { assertApiCompatible, IncompatiblePluginError } from "./apiVersion";
export { sanitizeHeaders } from "./headers";
export { satisfies } from "./satisfies";
