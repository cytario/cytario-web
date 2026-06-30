import type { Feature, FeatureCollection, Geometry } from "geojson";

import { SidecarRepository } from "./sidecarRepository";

export interface AnnotationClassification {
  name: string;
  color: [number, number, number];
}

export interface AnnotationProperties {
  id?: string;
  name?: string;
  classification?: AnnotationClassification;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type AnnotationFeature = Feature<Geometry, AnnotationProperties>;

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
    const features = (collection?.features as AnnotationFeature[] | undefined) ?? [];
    if (features.length) byUser[userId] = features;
  }
  return byUser;
}
