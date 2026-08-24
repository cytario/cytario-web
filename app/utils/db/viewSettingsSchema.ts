import { z } from "zod";

import type {
  ByteDomain,
  LayersStateEntry,
  RGB,
} from "~/components/.client/ImageViewer/state/store/types";

const SCHEMA_VERSION = "1.0";

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
  overlays: z.record(z.string(), z.unknown()).default({}),
  overlaysFillOpacity: z.number().default(0.8),
  showCellOutline: z.boolean().default(true),
  annotationsOpacity: z.number().default(1),
  showAnnotationOutline: z.boolean().default(true),
});

export const viewSettingsDocumentSchema = z.object({
  cytario: z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    kind: z.literal("settings"),
    image: z.string(),
    author: z.string(),
  }),
  views: z.array(viewSettingsChannelSchema),
});

export type ViewSettingsDocument = z.infer<typeof viewSettingsDocumentSchema>;
export type ViewSettingsEntry = z.infer<typeof viewSettingsChannelSchema>;

export const VIEW_SETTINGS_SCHEMA_VERSION = SCHEMA_VERSION;

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
    overlays: entry.overlays as LayersStateEntry["overlays"],
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
