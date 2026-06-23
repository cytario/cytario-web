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

/**
 * Reads a user's own annotation features (level-0 pixel coordinates) from their
 * sidecar — the editable/savable set (single-writer, no cross-user
 * contamination). Returns `[]` when the image has no annotations yet.
 */
export async function getAnnotationsWasm(
  resourceId: string,
  userId: string,
): Promise<AnnotationFeature[]> {
  const repo = new SidecarRepository(resourceId, userId);
  const collection = await repo.read<FeatureCollection>("annotations");
  return (collection?.features as AnnotationFeature[] | undefined) ?? [];
}
