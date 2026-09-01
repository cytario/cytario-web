import type { FeatureCollection } from "geojson";

import type { AnnotationFeature } from "./annotationSchema";
import { validAnnotationFeatures } from "./annotationSchema";
import { SidecarRepository } from "./sidecarRepository";

// The annotation feature/property/classification types are derived from the zod
// schema (single source of truth, C-307); re-exported here so existing importers
// keep their `~/utils/db/getAnnotationsWasm` path.
export type {
  AnnotationClassification,
  AnnotationFeature,
  AnnotationProperties,
} from "./annotationSchema";

/** A set of annotations owned by one user. `id` is the sidecar key segment
 *  (UUID for new sets, legacy userId for pre-migration files). `createdBy` is
 *  the author extracted from the sidecar's `cytario.createdBy` field. */
export type AnnotationSet = {
  id: string;
  createdBy: string;
  features: AnnotationFeature[];
};

/**
 * Reads EVERY annotation set for the image in one round-trip — the single
 * source of truth for the viewer's annotation sets. Each set's sidecar is parsed
 * to its feature array; sets with no features are dropped (lazy-create semantics).
 * The `createdBy` field is extracted from the sidecar's `cytario.createdBy`
 * body field — for legacy files (pre-C-330) this falls back to `cytario.author`,
 * then to the key segment (userId).
 */
export async function readAllAnnotations(resourceId: string): Promise<AnnotationSet[]> {
  const documents = await SidecarRepository.readAll<
    FeatureCollection & {
      cytario?: { createdBy?: string; author?: string };
    }
  >(resourceId, "annotations");
  const sets: AnnotationSet[] = [];
  for (const [setId, collection] of Object.entries(documents)) {
    // Validate + normalize on read: drop malformed features (external/legacy),
    // auto-close rings, normalize ids — so nothing degenerate reaches render.
    const features = validAnnotationFeatures(collection?.features);
    if (!features.length) continue;
    sets.push({
      id: setId,
      createdBy: collection?.cytario?.createdBy ?? collection?.cytario?.author ?? setId,
      features,
    });
  }
  return sets;
}
