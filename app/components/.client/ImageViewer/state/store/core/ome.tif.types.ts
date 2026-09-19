// Re-export shim. The viewer's Image / Loader / Channel / Wavelength types
// are now defined structurally in @cytario/plugin-api; new code should prefer
// importing directly from "@cytario/plugin-api".

export type {
  Image,
  Loader,
  LoaderLevel,
  Channel,
  Wavelength,
  WavelengthUnit,
  PixelType,
  PixelsMetadata,
} from "@cytario/plugin-api";

// Compatibility alias for a viv-compatible pixel-source level.
export type { LoaderLevel as GenericPixelSource } from "@cytario/plugin-api";
