import { ExportRenderError, type ViewerStoreSource } from "./composeCapture";
import { validAnnotationFeatures } from "~/utils/db/annotationSchema";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** The class every export annotation is filed under. */
export const CAPTURES_CLASS = "Captures";

export interface ExportProvenanceInput {
  /** Level-0 pixel bounds of the exported extent: [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number];
  /** The region's name — the capture timestamp; the annotation already
   *  belongs to the image, so the image name is not repeated. */
  name: string;
}

/**
 * Commits the provenance box annotation after a current-view capture: a
 * rectangle region of exactly the exported level-0 pixel extent, written
 * through the same store path a canvas-stamped box takes — minted identity
 * (id, name, timestamps), validated, written to the active set (created
 * first when the image has none, as a canvas draw does), filed under the
 * "Captures" class (registered with a palette color on first use),
 * auto-selected, and its class revealed. No new persistence surface.
 */
export const commitExportAnnotation = (
  storeSource: ViewerStoreSource,
  { bounds, name }: ExportProvenanceInput,
): void => {
  const [minX, minY, maxX, maxY] = bounds;

  const now = new Date().toISOString();
  const exportedRegion: AnnotationFeature = {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
          [minX, minY],
        ],
      ],
    },
    properties: {
      name,
      createdAt: now,
      updatedAt: now,
    },
  };

  const valid = validAnnotationFeatures([exportedRegion]);
  if (valid.length === 0) {
    throw new ExportRenderError("The exported area is not a valid annotation region.");
  }

  const setId = storeSource.getState().ensureOwnSet();
  const store = storeSource.getState();
  const targetSet = store.annotationSets.find((set) => set.id === setId);
  if (!targetSet) throw new ExportRenderError("No annotation set could receive the export region.");

  const regionId = valid[0].id;
  store.updateSetFeatures(setId, [...targetSet.features, ...valid]);
  store.setAnnotationClassForIds(setId, [regionId], CAPTURES_CLASS);
  store.setAnnotationSelectedIds([regionId]);
  store.showAnnotationClass(setId, CAPTURES_CLASS);
};
