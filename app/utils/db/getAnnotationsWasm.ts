import type { FeatureCollection } from "geojson";

import type { AnnotationFeature } from "./annotationSchema";
import { validAnnotationFeatures } from "./annotationSchema";
import { SidecarRepository } from "./sidecarRepository";

export type {
  AnnotationClassification,
  AnnotationFeature,
  AnnotationProperties,
} from "./annotationSchema";

/** A set of annotations. `createdBy` undefined means unowned (e.g. imported
 *  QuPath export with no cytario envelope) — editable by anyone. */
export type AnnotationSet = {
  id: string;
  createdBy: string | undefined;
  features: AnnotationFeature[];
  name: string | undefined;
};

/**
 * Reads EVERY annotation set for the image in one round-trip. Sets with no
 * features are dropped (lazy-create semantics); `createdBy` is absent for
 * QuPath exports (no `cytario` envelope), leaving the set unowned.
 */
export async function readAllAnnotations(resourceId: string): Promise<AnnotationSet[]> {
  const documents = await SidecarRepository.readAll<
    FeatureCollection & {
      cytario?: { createdBy?: string; name?: string };
    }
  >(resourceId, "annotations");
  const sets: AnnotationSet[] = [];
  for (const [setId, collection] of Object.entries(documents)) {
    // Validate + normalize on read so nothing degenerate reaches render.
    const features = validAnnotationFeatures(collection?.features);
    if (!features.length) continue;
    sets.push({
      id: setId,
      createdBy: collection?.cytario?.createdBy,
      name: collection?.cytario?.name,
      features,
    });
  }
  return sets;
}
