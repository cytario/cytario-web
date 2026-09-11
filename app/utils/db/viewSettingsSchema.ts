import { z } from "zod";

import type {
  ByteDomain,
  LayersStateEntry,
  RGB,
} from "~/components/.client/ImageViewer/state/store/types";

const SCHEMA_VERSION = "1.1";

const overlayClassSchema = z.object({
  sourceColumn: z.string(),
  label: z.string(),
  mode: z.enum(["boolean", "threshold", "continuous"]),
  operator: z.enum([">", ">=", "<", "<=", "=", "!="]).optional(),
  threshold: z.number().optional(),
});

const overlayConfigSchema = z.object({
  version: z.literal(1),
  columns: z.object({
    id: z.string(),
    geometry: z.string(),
    x: z.string(),
    y: z.string(),
  }),
  classes: z.array(overlayClassSchema),
});

const overlayMarkerSchema = z.object({
  color: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  count: z.number(),
  isVisible: z.boolean(),
  label: z.string().optional(),
});

const overlayEntrySchema = z.object({
  markers: z.record(z.string(), overlayMarkerSchema),
  config: overlayConfigSchema.nullable(),
});

/** Sidecar overlays are either the new entry shape or the legacy bare markers record. */
const sidecarOverlaysSchema = z.union([
  z.record(z.string(), overlayEntrySchema),
  z.record(z.string(), z.unknown()),
]);

export const viewSettingsChannelSchema = z.object({
  id: z.string(),
  author: z.string(),
  name: z.string().optional(),
  shared: z.boolean().default(false),
  channels: z.record(
    z.string(),
    z.object({
      isVisible: z.boolean().optional(),
      contrastLimits: z.tuple([z.number(), z.number()]).optional(),
      color: z.tuple([z.number(), z.number(), z.number()]).optional(),
    }),
  ),
  channelsOpacity: z.number().default(1),
  overlays: sidecarOverlaysSchema.default({}),
  overlaysFillOpacity: z.number().default(0.8),
  showCellOutline: z.boolean().default(true),
  annotationsOpacity: z.number().default(1),
  showAnnotationOutline: z.boolean().default(true),
});

export const viewSettingsDocumentSchema = z.object({
  cytario: z.object({
    schemaVersion: z.string(),
    kind: z.literal("settings"),
    image: z.string(),
    author: z.string(),
  }),
  views: z.array(viewSettingsChannelSchema),
});

export type OverlayConfigSidecar = z.infer<typeof overlayConfigSchema>;
export type OverlayEntrySidecar = z.infer<typeof overlayEntrySchema>;
export type ViewSettingsDocument = z.infer<typeof viewSettingsDocumentSchema>;
export type ViewSettingsEntry = z.infer<typeof viewSettingsChannelSchema>;

export const VIEW_SETTINGS_SCHEMA_VERSION = SCHEMA_VERSION;

/**
 * Migrate a sidecar overlays record: legacy v1.0 sidecars stored bare marker
 * records per resource (no config) — wrap them into the entry shape with a
 * null config so old persisted state keeps working.
 */
export function migrateSidecarOverlays(overlays: unknown): Record<string, OverlayEntrySidecar> {
  const entries = z.record(z.string(), z.unknown()).safeParse(overlays);
  if (!entries.success) return {};
  const out: Record<string, OverlayEntrySidecar> = {};
  for (const [resourceId, value] of Object.entries(entries.data)) {
    const parsed = overlayEntrySchema.safeParse(value);
    if (parsed.success) {
      out[resourceId] = parsed.data;
      continue;
    }
    const legacy = z.record(z.string(), overlayMarkerSchema).safeParse(value);
    if (legacy.success) {
      // Pre-config sidecar: markers only. Config is re-derived on next load.
      out[resourceId] = { markers: legacy.data, config: null };
    }
    // Unparseable entries are dropped — one corrupt resource must not break
    // the rest of the view.
  }
  return out;
}

function rgbToHex(color: RGB): string {
  return color
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function hexToRgb(hex: string): RGB {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [r, g, b];
}

export function layersStateToSidecarEntry(entry: LayersStateEntry): ViewSettingsEntry {
  const channels: Record<string, ViewSettingsEntry["channels"][string]> = {};
  for (const [key, config] of Object.entries(entry.channels)) {
    channels[key] = {
      isVisible: config.isVisible,
      contrastLimits: config.contrastLimits as ByteDomain | undefined,
      color: config.color as RGB | undefined,
    };
  }
  return {
    id: entry.id,
    author: entry.author,
    name: entry.name,
    shared: entry.shared ?? false,
    channels,
    channelsOpacity: entry.channelsOpacity,
    overlays: entry.overlays as ViewSettingsEntry["overlays"],
    overlaysFillOpacity: entry.overlaysFillOpacity,
    showCellOutline: entry.showCellOutline,
    annotationsOpacity: entry.annotationsOpacity,
    showAnnotationOutline: entry.showAnnotationOutline,
  };
}

export function sidecarEntryToLayersState(entry: ViewSettingsEntry): LayersStateEntry {
  const channels: LayersStateEntry["channels"] = {};
  for (const [key, config] of Object.entries(entry.channels)) {
    channels[key] = {
      isVisible: config.isVisible,
      contrastLimits: config.contrastLimits as ByteDomain | undefined,
      color: config.color as RGB | undefined,
    };
  }
  return {
    id: entry.id,
    author: entry.author,
    channels,
    overlays: migrateSidecarOverlays(entry.overlays) as LayersStateEntry["overlays"],
    channelsOpacity: entry.channelsOpacity,
    overlaysFillOpacity: entry.overlaysFillOpacity,
    showCellOutline: entry.showCellOutline,
    annotationsOpacity: entry.annotationsOpacity,
    showAnnotationOutline: entry.showAnnotationOutline,
    isChannelsLoading: 0,
    isOverlaysLoading: 0,
    name: entry.name,
    shared: entry.shared,
  };
}

export { rgbToHex, hexToRgb };
