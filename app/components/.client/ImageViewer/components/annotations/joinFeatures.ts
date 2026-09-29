import { union } from "@turf/union";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { classNameOf } from "../../state/store/annotations/annotations.store";
import type { ViewerStore } from "../../state/store/types";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

export const isJoinableRegion = (feature: AnnotationFeature): boolean =>
  feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon";

export interface JoinQualification {
  className: string;
  regions: AnnotationFeature[];
}

/** One joinable same-class group of candidates (≥2 regions). */
export interface JoinOffer {
  className: string;
  count: number;
  ids: string[];
}

export type JoinOfferAction = JoinOffer & { onJoin: () => void };

/** Join qualification for candidate features: ≥2 same-class regions (Polygon/
 *  MultiPolygon — points are never join-able). No pairwise-overlap
 *  precondition: disjoint same-class regions merge into a MultiPolygon. */
export const qualifyJoin = (candidates: AnnotationFeature[]): JoinQualification | null => {
  if (candidates.length < 2) return null;
  const regions = candidates.filter(isJoinableRegion);
  if (regions.length < 2) return null;
  const className = classNameOf(regions[0]);
  if (!regions.every((f) => classNameOf(f) === className)) return null;
  return { className, regions };
};

/** Per-class Join offers over arbitrary candidates (e.g. the current
 *  selection): one offer per same-class group of ≥2 regions — a mixed
 *  cross-class selection yields one offer per class, not none. */
export const joinOffersForFeatures = (candidates: AnnotationFeature[]): JoinOffer[] => {
  const groups = new Map<string, AnnotationFeature[]>();
  for (const f of candidates) {
    if (!isJoinableRegion(f)) continue;
    const className = classNameOf(f);
    const group = groups.get(className) ?? [];
    group.push(f);
    groups.set(className, group);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([className, items]) => ({
      className,
      count: items.length,
      ids: items.map((f) => f.id as string),
    }));
};

/** Union the regions with turf (polclip under the hood). The survivor — the
 *  caller's chosen identity — keeps its id/name/class; polclip failures return
 *  null so callers can omit the affordance rather than corrupt data. */
export const unionJoinRegions = (
  regions: AnnotationFeature[],
  survivor: AnnotationFeature,
): AnnotationFeature | null => {
  try {
    const collection: FeatureCollection<Polygon | MultiPolygon> = {
      type: "FeatureCollection",
      features: regions.map((r) => ({
        ...r,
        geometry: r.geometry as Polygon | MultiPolygon,
      })),
    };
    const merged = union(collection);
    if (!merged?.geometry) return null;
    return {
      ...survivor,
      geometry: merged.geometry,
      properties: { ...survivor.properties, updatedAt: new Date().toISOString() },
    };
  } catch {
    return null;
  }
};

/** Store-level join: qualify, union, write the set (one updateSetFeatures →
 *  one undo entry + the debounced sidecar write), then select the survivor.
 *  Returns the survivor id, or null when the targets don't qualify. */
export const joinFeaturesInSet = (
  store: { getState: () => ViewerStore },
  setId: string,
  ids: string[],
): string | null => {
  const state = store.getState();
  const set = state.annotationSets.find((s) => s.id === setId);
  if (!set) return null;

  const candidates = ids
    .map((id) => set.features.find((f) => f.id === id))
    .filter((f): f is AnnotationFeature => !!f);
  const qualification = qualifyJoin(candidates);
  if (!qualification) return null;

  // Survivor = the lowest position in the set's array — deterministic, and it
  // keeps its id, name, and class; the swallowed features vanish (undo
  // restores them).
  const survivorIndex = Math.min(...qualification.regions.map((r) => set.features.indexOf(r)));
  const survivor = set.features[survivorIndex];
  const merged = unionJoinRegions(qualification.regions, survivor);
  if (!merged) return null;

  const swallowed = new Set(
    qualification.regions.map((r) => r.id).filter((id) => id !== survivor.id),
  );
  const remaining = set.features.filter((f) => !swallowed.has(f.id));
  const next = remaining.map((f) => (f.id === survivor.id ? merged : f));

  // updateSetFeatures prunes the swallowed ids from the selection; the
  // survivor selection is set after so it survives the prune. One history
  // entry covers the whole join.
  state.updateSetFeatures(setId, next);
  state.setAnnotationSelectedIds([survivor.id as string]);
  state.setAnnotationSelectionAnchor(survivor.id as string);
  return survivor.id as string;
};
