import type { ExportViewResult, ViewerStoreSource } from "../../export/exportView";
import { UNCLASSIFIED } from "../../state/store/annotations/annotations.store";
import { validAnnotationFeatures } from "~/utils/db/annotationSchema";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/**
 * Commits the provenance box annotation after a region export: a rectangle
 * region of exactly the exported level-0 pixel extent, written through the
 * same store path a canvas-stamped box takes — minted identity (id, name from
 * the captured filename, timestamps) exactly as the layer's `stampEdit` mints
 * it for a committed draw, validated, `updateSetFeatures` (which the sync
 * middleware persists and the undo history records), auto-selected, and its
 * class revealed. No new persistence surface.
 */
export const commitExportAnnotation = (
  storeSource: ViewerStoreSource,
  sourceSetId: string,
  result: ExportViewResult,
  sourceFeature: AnnotationFeature,
): void => {
  const store = storeSource.getState();
  const geometry = sourceFeature.geometry;
  if (!geometry || geometry.type !== "Polygon") return;
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) return;

  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

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
      name: result.filename.replace(/\.png$/, ""),
      createdAt: now,
      updatedAt: now,
    },
  };

  const valid = validAnnotationFeatures([exportedRegion]);
  if (valid.length === 0) return;
  const stampedId = valid[0].id;

  const targetSet =
    store.annotationSets.find((set) => set.id === store.activeSetId) ??
    store.annotationSets.find((set) => set.id === sourceSetId);
  if (!targetSet) return;

  store.updateSetFeatures(targetSet.id, [...targetSet.features, ...valid]);

  store.setAnnotationSelectedIds([stampedId]);
  store.showAnnotationClass(targetSet.id, UNCLASSIFIED);
};
