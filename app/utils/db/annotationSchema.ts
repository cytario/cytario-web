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
 * The single source of truth for an annotation feature — one zod schema applied
 * at both I/O boundaries, `readAllAnnotations` (accept) and the layer's `onEdit`
 * (write), so what we persist and what we accept can never drift (C-307). The
 * TS types are derived from it (`z.infer` below), so the type can't drift from
 * the schema either.
 *
 * Geometry + feature shape come from `zod-geojson` (RFC 7946): positions are
 * >= 2 plain numbers (rejects `null`/NaN), and polygon linear rings are closed
 * (first == last) with >= 4 positions (a triangle = 3 corners + the closing
 * repeat). We do NOT auto-close rings — deck emits closed rings, so an open
 * external ring is a malformed feature and is dropped.
 *
 * Identity is the standard top-level GeoJSON `feature.id` (RFC 7946 §3.2, and
 * where QuPath puts it), required as a non-empty string and used as the
 * selection key. An id-less feature is dropped — no synthetic fallback.
 */

const geometrySchema = z.discriminatedUnion("type", [
  GeoJSONPointSchema,
  GeoJSONPolygonSchema,
  GeoJSONMultiPolygonSchema,
]);

// Validated because the renderer trusts it: `classification.color` is fed
// straight to deck.gl as an RGB triple. Accept >=3 numeric channels and coerce
// to RGB (drop a legacy alpha channel) rather than reject the whole feature over
// color shape — legacy/imported sidecars may store RGBA.
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

// zod-geojson's Feature makes `properties` nullable; wrap ours so a
// missing/null `properties` (lenient read) normalizes to an object, matching the
// GeoJSON Feature shape deck.gl's layer types expect. The generic's `properties`
// param is typed `GeoJSONProperties | null` (a JSON record); our loose object
// carries a stricter, richer shape, so we assert the schema type at the boundary
// — the runtime schema (loose passthrough) is a superset of a JSON record, so
// validation semantics are unchanged.
const normalizedPropertiesSchema = propertiesSchema
  .nullish()
  .transform((p) => p ?? {}) as unknown as z.ZodType<GeoJSONProperties>;

const baseFeatureSchema = GeoJSONFeatureGenericSchema(
  GeoJSONPositionSchema,
  normalizedPropertiesSchema,
  geometrySchema,
);

// Require the standard top-level GeoJSON `feature.id` as a non-empty string.
// RFC 7946 makes `id` optional and `string | number`; we narrow it to a required
// string (the selection key). A feature without one is rejected → dropped.
const featureSchema = baseFeatureSchema.refine(
  (f): f is typeof f & { id: string } => {
    const id = (f as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0;
  },
  { message: "feature.id must be a non-empty string" },
);

// The generic's inferred output omits the base `id` field and widens
// `properties` back to a JSON record, so derive the annotation type explicitly:
// parsed geometry, our present-and-typed `properties`, and the required id.
export type AnnotationFeature = Omit<z.infer<typeof baseFeatureSchema>, "properties" | "id"> & {
  properties: AnnotationProperties;
  id: string;
};

/**
 * Validate a raw feature array: drop anything that fails the schema (logged),
 * keep the survivors. Used on both the read and write boundaries so the store is
 * valid by construction and no malformed sidecar feature (external or legacy)
 * ever reaches render. Per-feature drop, not throw: one bad feature can't nuke
 * the whole collection.
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
