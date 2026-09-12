import type { IconName } from "@cytario/design";

export const PILLAR_IDS = [
  "connections",
  "favorites",
  "recent",
  "channels",
  "overlays",
  "annotations",
  "views",
  "overview",
  "spatial-elements",
  "z-planes",
  "coordinate-systems",
] as const;

export type PillarId = (typeof PILLAR_IDS)[number];

export interface Pillar {
  id: PillarId;
  title: string;
  icon: IconName;
}

export const PILLARS: Record<PillarId, Pillar> = {
  connections: { id: "connections", title: "Connections", icon: "Plug" },
  favorites: { id: "favorites", title: "Favorites", icon: "Star" },
  recent: { id: "recent", title: "Recent", icon: "Clock" },
  channels: { id: "channels", title: "Channels", icon: "Microscope" },
  overlays: { id: "overlays", title: "Overlays", icon: "Layers2" },
  annotations: { id: "annotations", title: "Annotations", icon: "Lasso" },
  views: { id: "views", title: "Views", icon: "Columns3" },
  overview: { id: "overview", title: "Overview", icon: "Image" },
  "spatial-elements": { id: "spatial-elements", title: "Elements", icon: "Layers2" },
  "z-planes": { id: "z-planes", title: "Z planes", icon: "Columns3" },
  "coordinate-systems": {
    id: "coordinate-systems",
    title: "Coordinate systems",
    icon: "Crosshair",
  },
};
