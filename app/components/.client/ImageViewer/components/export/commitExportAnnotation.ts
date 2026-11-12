import type { ViewerStoreSource } from "./composeCapture";
import { UNCLASSIFIED } from "../../state/store/annotations/annotations.store";
import { validAnnotationFeatures } from "~/utils/db/annotationSchema";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

export interface ExportProvenanceInput {
  /** Level-0 pixel bounds of the exported extent: [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number];
  /** The captured filename — the region's default name. */
  filename: string;
}

/**
 * Commits the provenance box annotation after a current-view capture: a
 * rectangle region of exactly the exported level-0 pixel extent, written
 * through the same store path a canvas-stamped box takes — minted identity
 * (id, name from the captured filename, timestamps) exactly as the layer's
 * `stampEdit` mints it for a committed draw, validated, `updateSetFeatures`
 * (which the sync middleware persists and the undo history records),
 * auto-selected, and its class revealed. No new persistence surface.
 */
export const commitExportAnnotation = (
  storeSource: ViewerStoreSource,
  sourceSetId: string | null,
  { bounds, filename }: ExportProvenanceInput,
): void => {
  const store = storeSource.getState();
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
      name: filename.replace(/\.png$/, ""),
      createdAt: now,
      updatedAt: now,
    },
  };

  const valid = validAnnotationFeatures([exportedRegion]);
  if (valid.length === 0) return;
  const stampedId = valid[0].id;

  const targetSet =
    store.annotationSets.find((set) => set.id === store.activeSetId) ??
    (sourceSetId ? store.annotationSets.find((set) => set.id === sourceSetId) : undefined);
  if (!targetSet) return;

  store.updateSetFeatures(targetSet.id, [...targetSet.features, ...valid]);

  store.setAnnotationSelectedIds([stampedId]);
  store.showAnnotationClass(targetSet.id, UNCLASSIFIED);
};
