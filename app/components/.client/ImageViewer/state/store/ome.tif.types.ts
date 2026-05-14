// Re-export shim. The viewer's Image / Loader / Channel / Wavelength types
// are now defined structurally in @cytario/plugin-api and consumed back here.
// Existing call sites (~9) continue to import from this file unchanged;
// new code should prefer importing directly from "@cytario/plugin-api".
//
// Follow-up: migrate the 9 consumers + remove this shim after adding an
// ESLint no-restricted-imports rule.

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

// GenericPixelSource was the previous local alias for a viv-compatible
// pixel-source level. LoaderLevel from the plugin API covers the same
// surface; keep this alias so the existing call sites do not need to
// update their imports in this PR.
export type { LoaderLevel as GenericPixelSource } from "@cytario/plugin-api";
