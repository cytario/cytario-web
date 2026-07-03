import { z } from "zod";
import type { GeoJSONProperties } from "zod-geojson";
import {
  GeoJSONFeatureGenericSchema,
  GeoJSONMultiPolygonSchema,
  GeoJSONPointSchema,
  GeoJSONPolygonSchema,
  GeoJSONPositionSchema,
} from "zod-geojson";

/**
 * Single source of truth for an annotation feature: one zod schema applied at
 * both I/O boundaries — `readAllAnnotations` (accept) and the layer's `onEdit`
 * (write) — so what we accept and what we persist can never drift (C-307). The
 * TS types are derived via `z.infer`, so the types can't drift from the schema.
 */

// Geometry from zod-geojson (RFC 7946): positions are >= 2 plain numbers
// (rejects null/NaN) and polygon rings are closed (first == last) with >= 4
// positions. Rings are not auto-closed — deck emits closed rings, so an open
// ring is malformed and dropped.
const geometrySchema = z.discriminatedUnion("type", [
  GeoJSONPointSchema,
  GeoJSONPolygonSchema,
  GeoJSONMultiPolygonSchema,
]);

// `classification.color` is fed straight to deck.gl as an RGB triple. Accept
// >= 3 channels and coerce to RGB (drop a legacy alpha) rather than reject the
// whole feature over color shape — legacy/imported sidecars may store RGBA.
const classificationSchema = z.object({
  name: z.string(),
  color: z
    .array(z.number())
    .min(3)
    .transform((c) => [c[0], c[1], c[2]] as [number, number, number]),
});

const propertiesSchema = z.looseObject({
  name: z.string().optional(),
  classification: classificationSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type AnnotationClassification = z.infer<typeof classificationSchema>;
export type AnnotationProperties = z.infer<typeof propertiesSchema>;

// zod-geojson makes `properties` nullable; normalize a missing/null value to an
// object so it matches the GeoJSON shape deck.gl's layer types expect. The cast
// bridges the generic's JSON-record param type to our richer loose object — the
// runtime schema is a superset of a JSON record, so semantics are unchanged.
const normalizedPropertiesSchema = propertiesSchema
  .nullish()
  .transform((p) => p ?? {}) as unknown as z.ZodType<GeoJSONProperties>;

const baseFeatureSchema = GeoJSONFeatureGenericSchema(
  GeoJSONPositionSchema,
  normalizedPropertiesSchema,
  geometrySchema,
);

// Identity is the standard top-level GeoJSON `feature.id` (RFC 7946 §3.2, where
// QuPath puts it). RFC 7946 makes it optional and `string | number`; we narrow
// to a required non-empty string (the selection key). Missing → dropped, no
// synthetic fallback.
const featureSchema = baseFeatureSchema.refine(
  (f): f is typeof f & { id: string } => {
    const id = (f as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0;
  },
  { message: "feature.id must be a non-empty string" },
);

// The generic's inferred output omits the base `id` and widens `properties` to a
// JSON record, so derive the type explicitly: parsed geometry, our typed
// `properties`, and the required id.
export type AnnotationFeature = Omit<z.infer<typeof baseFeatureSchema>, "properties" | "id"> & {
  properties: AnnotationProperties;
  id: string;
};

/**
 * Validate a raw feature array: drop anything that fails the schema (logged),
 * keep the survivors. Run on both boundaries so the store is valid by
 * construction. Per-feature drop, not throw — one bad feature can't nuke the
 * whole collection.
 */
export function validAnnotationFeatures(raw: unknown): AnnotationFeature[] {
  if (!Array.isArray(raw)) return [];
  const out: AnnotationFeature[] = [];
  for (const item of raw) {
    const parsed = featureSchema.safeParse(item);
    if (!parsed.success) {
      console.warn("[annotations] dropped invalid feature:", parsed.error.issues);
      continue;
    }
    out.push(parsed.data as AnnotationFeature);
  }
  return out;
}
