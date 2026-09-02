import type { AnnotationFeature } from "./annotationSchema";
import { validAnnotationFeatures } from "./annotationSchema";

/** An annotation export file picked or dropped by the user (QuPath-style
 *  GeoJSON FeatureCollection, `.json` or `.geojson`). */
export function isAnnotationImportFile(file: File): boolean {
  return /\.(json|geojson)$/i.test(file.name);
}

/** Display name for an imported set: the filename minus its extension
 *  (e.g. "patient-12-tumor.geojson" → "patient-12-tumor"). */
export function annotationSetNameFromFile(file: File): string {
  return file.name.replace(/\.(json|geojson)$/i, "");
}

/**
 * Parse an annotation export into validated features; invalid features are
 * dropped. Throws on malformed JSON or when no valid feature remains.
 */
export async function parseAnnotationImportFile(file: File): Promise<AnnotationFeature[]> {
  let json: { features?: unknown };
  try {
    json = JSON.parse(await file.text()) as { features?: unknown };
  } catch {
    throw new Error(`"${file.name}" is not valid JSON`);
  }
  const features = validAnnotationFeatures(json.features);
  if (features.length === 0) {
    throw new Error(`"${file.name}" contains no valid annotation features`);
  }
  return features;
}
