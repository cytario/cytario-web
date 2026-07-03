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

/** Features per owner (Keycloak `sub`), level-0 pixel coordinates. */
export type AnnotationsByUser = Record<string, AnnotationFeature[]>;

/**
 * Reads EVERY user's annotations for the image in one round-trip — the single
 * source of truth for the viewer's per-user map. Each owner's sidecar is parsed
 * to its feature array; owners with an empty set are dropped (no key until a
 * user actually has annotations, which keeps the lazy-create semantics). Reads
 * only — IAM pins writes to each caller's own `sub`.
 */
export async function readAllAnnotations(resourceId: string): Promise<AnnotationsByUser> {
  const documents = await SidecarRepository.readAll<FeatureCollection>(resourceId, "annotations");
  const byUser: AnnotationsByUser = {};
  for (const [userId, collection] of Object.entries(documents)) {
    // Validate + normalize on read: drop malformed features (external/legacy),
    // auto-close rings, normalize ids — so nothing degenerate reaches render.
    const features = validAnnotationFeatures(collection?.features);
    if (features.length) byUser[userId] = features;
  }
  return byUser;
}
