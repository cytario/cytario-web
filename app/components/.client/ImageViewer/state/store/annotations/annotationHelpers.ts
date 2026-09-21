import { CATEGORICAL_COLORS } from "../../../components/sidebar/SectionRow/ColorPicker/utils";
import type { RGB } from "../types";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";

/** Group name for features without a classification.
 *
 *  Invariant: a feature is unclassified iff `properties.classification` is
 *  absent — we never persist a synthetic class named "Unclassified" (that keeps
 *  the on-disk shape aligned with the QuPath/RFC-7946 "absence = unclassified"
 *  convention the read/write schema relies on). The "Unclassified" group is a
 *  view-model construct only: grouping collapses the null case to this name via
 *  `classNameOf`, and the name is reserved so it can't become a real class. */
export const UNCLASSIFIED = "Unclassified";

/** Fallback color for features/groups without a classification — a neutral gray,
 *  shared by the canvas layer, the group-row dot, and the sidebar thumbnail so
 *  "Unclassified" looks identical everywhere. */
export const UNCLASSIFIED_COLOR: RGB = [120, 120, 120];

/** A feature's classification name, or the `Unclassified` fallback. Shared by
 *  the list grouping and the layer's visibility check so they agree on keys. */
export const classNameOf = (feature: AnnotationFeature): string =>
  feature.properties?.classification?.name ?? UNCLASSIFIED;

/** "Unclassified" is the reserved view-model bucket, never a real class name. */
export const isReservedClassName = (name: string): boolean =>
  name.trim().toLowerCase() === UNCLASSIFIED.toLowerCase();

/** Generates the next auto-incrementing annotation name as a zero-padded
 *  4-digit index ("0001", "0002", …, "0242", "22358") skipping any already
 *  taken by an existing feature. Called at draw time so every new region is
 *  born with a unique name. */
export const generateAnnotationName = (features: AnnotationFeature[]): string => {
  const taken = new Set(
    features
      .map((f) => f.properties?.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0),
  );
  for (let n = 1; ; n++) {
    const candidate = String(n).padStart(4, "0");
    if (!taken.has(candidate)) return candidate;
  }
};

/** A geometry translated by a slide-coordinate delta (paste offset for
 *  duplicates). Position channels beyond x/y pass through untouched. */
export const translateGeometry = (
  geometry: AnnotationFeature["geometry"],
  [dx, dy]: [number, number],
): AnnotationFeature["geometry"] => {
  const translatePosition = (position: number[]): number[] => [
    position[0] + dx,
    position[1] + dy,
    ...position.slice(2),
  ];
  if (geometry.type === "Point") {
    return { ...geometry, coordinates: translatePosition(geometry.coordinates) };
  }
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => ring.map(translatePosition)),
    };
  }
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map(translatePosition)),
    ),
  };
};

/** The default name minted for a newly created set: the lowest
 *  "Annotation Set N.json" not already taken (mirrors generateAnnotationName's
 *  lowest-unused-index rule, so delete + re-draw never collides). */
export const generateSetName = (sets: AnnotationSet[]): string => {
  const taken = new Set(sets.map((s) => s.name).filter((n): n is string => !!n));
  for (let n = 1; ; n++) {
    const candidate = `Annotation Set ${n}.json`;
    if (!taken.has(candidate)) return candidate;
  }
};

/** The display name of a feature: its `properties.name` if set, else a
 *  fallback showing the ID (for legacy/imported features that predate
 *  auto-naming). Shared by the tooltip and the sidebar label so they agree. */
export const annotationNameOf = (feature: AnnotationFeature): string =>
  feature.properties?.name ?? `ID: ${feature.id}`;

/** RGB view of the shared categorical palette (drops the palette's alpha). */
const PALETTE: RGB[] = CATEGORICAL_COLORS.map(([r, g, b]): RGB => [r, g, b]);

const colorKey = (c: RGB): string => c.join(",");

/** The color already assigned to a class of this name — the registry first (so
 *  an empty defined class keeps its color), then any member feature. */
export const classColor = (
  classes: AnnotationClass[],
  features: AnnotationFeature[],
  name: string,
): RGB | undefined =>
  classes.find((c) => c.name === name)?.color ??
  features.find((f) => f.properties?.classification?.name === name)?.properties?.classification
    ?.color;

/** A palette color not used by any class (registry or feature), cycling once
 *  exhausted, skipping the unclassified gray so a class never looks unclassified. */
export const pickClassColor = (classes: AnnotationClass[], features: AnnotationFeature[]): RGB => {
  const used = new Set<string>();
  for (const c of classes) used.add(colorKey(c.color));
  for (const f of features) {
    const c = f.properties?.classification?.color;
    if (c) used.add(colorKey(c));
  }
  return PALETTE.find((c) => !used.has(colorKey(c))) ?? PALETTE[used.size % PALETTE.length];
};

/** A defined classification for the own set: a name + color that exists
 *  independently of any feature, so a class can be pre-created and kept empty. */
export interface AnnotationClass {
  name: string;
  color: RGB;
}
